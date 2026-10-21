import { browser } from "wxt/browser";
import { createApiClient } from "@/lib/api-client";
import { collectBackfill } from "@/lib/backfill";
import { h, render } from "@/lib/dom";
import { readOutboxSummary } from "@/lib/outbox";
import { pollPairing, startPairing } from "@/lib/pairing";
import { apiOrigin, loadCachedConfig, loadSettings, type Settings, saveCachedConfig, updateSettings } from "@/lib/settings";
import { createStore } from "@/lib/storage";
import "./style.css";

const POLL_INTERVAL_MS = 3000;
// Chromium keeps about 90 days of history by default.
const BACKFILL_DAYS = 90;
const store = createStore(browser.storage.local);
const api = createApiClient((input, init) => fetch(input, init));
const root = document.getElementById("app");
const timeFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
let pollTimer: ReturnType<typeof setInterval> | undefined;

function message(text: string, kind: "error" | "info" = "info") {
  return h("p", { class: kind, role: kind === "error" ? "alert" : "status" }, text);
}

async function show() {
  if (!root) return;
  const settings = await loadSettings(store);
  if (settings.pairing) return showPairing(settings);
  if (settings.apiUrl && settings.deviceToken) return showPaired(settings);
  return showSetup(settings);
}

function showSetup(settings: Settings, notice?: HTMLElement) {
  if (!root) return;
  const apiInput = h("input", { name: "api", type: "url", required: "", placeholder: "https://mein-tracker.example", autocomplete: "url" });
  apiInput.value = settings.apiUrl ?? "";
  const nameInput = h("input", { name: "name", required: "", maxlength: "100" });
  nameInput.value = settings.deviceName;
  const status = h("div", {});
  const form = h(
    "form",
    {},
    h("label", {}, "Adresse des Trackers", apiInput),
    h("label", {}, "Name dieses Geräts", nameInput),
    h("button", { type: "submit" }, "Koppeln"),
    status,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void pair(apiInput.value, nameInput.value.trim() || "Brave", status);
  });

  const revoked = settings.apiUrl && !settings.deviceToken
    ? message("Dieses Gerät ist nicht mehr gekoppelt (im Tracker widerrufen oder entkoppelt). Bitte neu koppeln.", "error")
    : null;
  render(root, h("h1", {}, "Read-Watch-Tracker"), revoked, notice ?? null, form);
}

async function pair(rawApi: string, deviceName: string, status: HTMLElement) {
  const origin = apiOrigin(rawApi);
  if (!origin) return render(status, message("Bitte eine Adresse mit https:// angeben.", "error"));
  // Access to exactly this host, asked for on the user's click (SPEC §7.2: no fixed host permissions).
  const granted = await browser.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return render(status, message("Ohne diese Berechtigung kann die Extension den Tracker nicht erreichen.", "error"));

  render(status, message("Code wird angefordert …"));
  const started = await startPairing({ store, api }, origin, deviceName);
  if (!started.ok) return render(status, message(started.message, "error"));
  await show();
}

async function showPairing(settings: Settings) {
  if (!root || !settings.pairing) return;
  const { code, apiUrl, expiresAt } = settings.pairing;
  const status = h("div", {}, message("Warte auf Bestätigung …"));
  render(
    root,
    h("h1", {}, "Gerät koppeln"),
    h("p", {}, "Gib diesen Code im Tracker unter Einstellungen → Gerät koppeln ein:"),
    h("p", { class: "code", "aria-label": `Code ${code.split("").join(" ")}` }, `${code.slice(0, 3)}-${code.slice(3)}`),
    h("p", {}, h("a", { href: `${apiUrl}/pair?code=${code}`, target: "_blank", rel: "noopener noreferrer" }, "Im Tracker öffnen")),
    h("p", { class: "muted" }, `Gültig bis ${timeFormat.format(new Date(expiresAt))}.`),
    status,
  );

  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const result = await pollPairing({ store, api });
    if (result === "pending" || result === "error") return;
    clearInterval(pollTimer);
    if (result === "paired") {
      await browser.runtime.sendMessage({ type: "options:sync-now" });
      await show();
    } else {
      showSetup(await loadSettings(store), message("Der Code ist abgelaufen. Bitte erneut koppeln.", "error"));
    }
  }, POLL_INTERVAL_MS);
}

async function showPaired(settings: Settings) {
  if (!root) return;
  const outbox = await readOutboxSummary(store);
  const syncButton = h("button", { type: "button" }, "Jetzt synchronisieren");
  const unpairButton = h("button", { type: "button", class: "danger" }, "Entkoppeln");

  syncButton.addEventListener("click", async () => {
    syncButton.setAttribute("disabled", "");
    await browser.runtime.sendMessage({ type: "options:sync-now" });
    await show();
  });
  unpairButton.addEventListener("click", async () => {
    if (!confirm("Gerät wirklich entkoppeln? Nicht gesendete Ereignisse bleiben gespeichert.")) return;
    await saveCachedConfig(store, null);
    await updateSettings(store, { apiUrl: null, deviceToken: null });
    await show();
  });

  render(
    root,
    h("h1", {}, "Read-Watch-Tracker"),
    h("p", {}, "Gekoppelt mit ", h("strong", {}, settings.apiUrl ?? ""), ` als „${settings.deviceName}“.`),
    h(
      "dl",
      {},
      h("dt", {}, "Wartende Ereignisse"),
      h("dd", {}, String(outbox.queued)),
      h("dt", {}, "Zuletzt synchronisiert"),
      h("dd", {}, outbox.lastSyncAt ? timeFormat.format(new Date(outbox.lastSyncAt)) : "noch nie"),
      ...(outbox.lastError ? [h("dt", {}, "Letzter Fehler"), h("dd", { class: "error" }, outbox.lastError)] : []),
      ...(outbox.dropped > 0 ? [h("dt", {}, "Verworfen (Speicher voll)"), h("dd", { class: "error" }, String(outbox.dropped))] : []),
    ),
    h("div", { class: "actions" }, syncButton, unpairButton),
    backfillSection(settings),
  );
}

function backfillSection(settings: Settings): HTMLElement {
  const button = h("button", { type: "button" }, `Verlauf der letzten ${BACKFILL_DAYS} Tage durchsuchen`);
  const status = h("div", {});
  button.addEventListener("click", async () => {
    // History access is requested only now, on this click (SPEC §7.9).
    const granted = await browser.permissions.request({ permissions: ["history"] });
    if (!granted) return render(status, message("Ohne Zugriff auf den Verlauf ist der Abgleich nicht möglich.", "error"));
    const cached = await loadCachedConfig(store);
    if (!cached || cached.config.sites.length === 0) {
      return render(status, message("Noch keine Seite freigeschaltet. Schalte zuerst deine Manga-Seiten im Popup frei.", "error"));
    }
    button.setAttribute("disabled", "");
    render(status, message("Durchsuche den Verlauf …"));
    const items = await browser.history.search({ text: "", startTime: Date.now() - BACKFILL_DAYS * 86_400_000, maxResults: 100_000 });
    const entries = collectBackfill(items, cached.config);
    await browser.runtime.sendMessage({ type: "options:backfill", entries });
    button.removeAttribute("disabled");
    render(
      status,
      message(`${entries.length} Serien gefunden und gesendet.`),
      settings.apiUrl
        ? h("p", {}, "Bestätige die Zuordnungen im Tracker: ", h("a", { href: `${settings.apiUrl}/inbox`, target: "_blank", rel: "noopener noreferrer" }, "Zuordnungen öffnen"))
        : null,
    );
  });
  return h(
    "section",
    {},
    h("h2", {}, "Kapitelstände aus dem Verlauf"),
    h("p", { class: "muted" }, "Sucht in Brave nach Kapiteln deiner freigeschalteten Seiten und schickt pro Serie das höchste Kapitel an den Tracker."),
    button,
    status,
  );
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("outbox" in changes || "settings" in changes) && !pollTimer) void show();
});
void show();
