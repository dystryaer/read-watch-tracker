import type { DeviceConfig } from "@rwt/core";
import { describe, expect, it, vi } from "vitest";
import type { ConfigResult } from "../src/lib/api-client";
import { syncConfig } from "../src/lib/config-sync";
import { RecentReads } from "../src/lib/recent";
import { loadCachedConfig, saveSettings } from "../src/lib/settings";
import { createStore } from "../src/lib/storage";
import { fakeStorage } from "./fakes";

const config: DeviceConfig = {
  sites: [{ sourceKey: "site:asura", domains: ["asuracomic.net"] }],
  thresholds: { scrollDepthPercent: 60, watchedPercent: 85 },
};
const paired = { apiUrl: "https://tracker.example", deviceToken: "T".repeat(43), deviceName: "Brave", pairing: null };

function deps(result: ConfigResult) {
  const store = createStore(fakeStorage());
  return {
    store,
    api: { getConfig: vi.fn(async () => result) },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => {}),
      unregisterContentScripts: vi.fn(async () => {}),
    },
    onUnauthorized: vi.fn(),
    now: () => 1000,
  };
}

describe("syncConfig", () => {
  it("does nothing but remove reader scripts while unpaired", async () => {
    const d = deps({ ok: true, notModified: true });
    expect(await syncConfig(d)).toBe("unpaired");
    expect(d.api.getConfig).not.toHaveBeenCalled();
  });

  it("stores a new config and registers the reader scripts", async () => {
    const d = deps({ ok: true, notModified: false, config, etag: '"v1"' });
    await saveSettings(d.store, paired);

    expect(await syncConfig(d)).toBe("updated");
    expect(await loadCachedConfig(d.store)).toEqual({ config, etag: '"v1"', fetchedAt: 1000 });
    expect(d.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
  });

  it("keeps the cached config when the server answers 304", async () => {
    const d = deps({ ok: true, notModified: true });
    await saveSettings(d.store, paired);
    await d.store.write("config", { config, etag: '"v1"', fetchedAt: 1 });

    expect(await syncConfig(d)).toBe("unchanged");
    expect(d.api.getConfig).toHaveBeenCalledWith(paired.apiUrl, paired.deviceToken, '"v1"');
    expect((await loadCachedConfig(d.store))?.config).toEqual(config);
  });

  it("reports a revoked token", async () => {
    const d = deps({ ok: false, kind: "unauthorized", message: "401" });
    await saveSettings(d.store, paired);

    expect(await syncConfig(d)).toBe("error");
    expect(d.onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe("RecentReads", () => {
  it("lets the same chapter through once every 12 hours", async () => {
    const store = createStore(fakeStorage());
    const recent = new RecentReads(store);
    const hour = 3_600_000;

    expect(await recent.claim("site:asura|overgeared|345", 0)).toBe(true);
    expect(await recent.claim("site:asura|overgeared|345", 11 * hour)).toBe(false);
    expect(await recent.claim("site:asura|overgeared|346", 11 * hour)).toBe(true);
    expect(await recent.claim("site:asura|overgeared|345", 12 * hour + 1)).toBe(true);
  });

  it("forgets entries older than 12 hours so storage stays small", async () => {
    const area = fakeStorage();
    const recent = new RecentReads(createStore(area));
    for (let i = 0; i < 50; i++) await recent.claim(`k${i}`, 0);

    await recent.claim("fresh", 13 * 3_600_000);

    expect(Object.keys((area.data.recent as Record<string, number>) ?? {})).toEqual(["fresh"]);
  });
});
