import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createApiClient } from "@/lib/api-client";
import { syncConfig } from "@/lib/config-sync";
import { Outbox } from "@/lib/outbox";
import { RecentReads } from "@/lib/recent";
import { createRouter } from "@/lib/router";
import { loadSettings, saveCachedConfig, updateSettings } from "@/lib/settings";
import { syncReaderScripts } from "@/lib/sites";
import { createStore } from "@/lib/storage";
import { createStreamStates, createTabStates } from "@/lib/tab-states";

export default defineBackground(() => {
  const store = createStore(browser.storage.local);
  const sessionStore = createStore(browser.storage.session);
  const tabStates = createTabStates(sessionStore);
  const streamStates = createStreamStates(sessionStore);
  const api = createApiClient((input, init) => fetch(input, init));

  // A revoked device stops tracking: token and config are dropped, reader scripts removed.
  async function onUnauthorized() {
    await updateSettings(store, { deviceToken: null });
    await saveCachedConfig(store, null);
    await syncReaderScripts(browser.scripting, null);
  }

  const outbox = new Outbox(
    store,
    {
      async postEvents(events) {
        const { apiUrl, deviceToken } = await loadSettings(store);
        if (!apiUrl || !deviceToken) return { ok: false, kind: "retry", message: "Nicht gekoppelt" };
        return api.postEvents(apiUrl, deviceToken, events);
      },
    },
    { now: Date.now, onUnauthorized: () => void onUnauthorized() },
  );

  const sync = () =>
    syncConfig({ store, api, scripting: browser.scripting, onUnauthorized: () => void onUnauthorized(), now: Date.now });

  const route = createRouter({
    extensionId: browser.runtime.id,
    store,
    outbox,
    recent: new RecentReads(store),
    tabStates,
    streamStates,
    api,
    sync,
    // Only these browser APIs are used for routing.
    browser: {
      tabs: { get: (tabId) => browser.tabs.get(tabId) },
      permissions: { contains: (permissions) => browser.permissions.contains(permissions) },
      injectReader: (tabId) => browser.scripting.executeScript({ target: { tabId }, files: ["/reader.js"] }),
    },
    onUnauthorized: () => void onUnauthorized(),
  });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    route(message, sender).then(sendResponse, () => sendResponse({ ok: false }));
    return true; // answer asynchronously
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void tabStates.remove(tabId);
    void streamStates.remove(tabId);
  });
  browser.runtime.onInstalled.addListener(() => void sync());
  browser.runtime.onStartup.addListener(() => void sync());
  void browser.alarms.create("flush", { periodInMinutes: 1 });
  void browser.alarms.create("config", { periodInMinutes: 15 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "flush") void outbox.flush();
    if (alarm.name === "config") void sync();
  });
  // New or removed credentials (pairing in the options page, revocation): resync and send.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "settings" in changes) void sync().then(() => outbox.flush({ force: true }));
  });
});
