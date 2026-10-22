import {
  DEFAULT_THRESHOLDS,
  type DeviceConfig,
  isAppBookKey,
  isServiceUrl,
  knownService,
  normalizeDomain,
  parseHttpUrl,
  ProgressEvent,
  type SiteRule,
  streamingSeriesKey,
} from "@rwt/core";
import { isLibraryPage, type LibraryService, libraryServiceForUrl } from "../library/pages";
import { isHistoryPage, latestPerSeries } from "../streaming/history";
import { serviceForUrl, type StreamingServiceKey } from "../streaming/services";
import { deterministicEventId } from "./event-id";
import type { ApiClient } from "./api-client";
import { backfillEventId } from "./backfill";
import { classifySender, ContentMessage, type Detection, ExtensionPageMessage, HistoryEntry, LibraryEntry } from "./messages";
import type { Outbox } from "./outbox";
import type { RecentReads } from "./recent";
import { loadCachedConfig, loadSettings } from "./settings";
import { findSiteForUrl } from "./sites";
import type { Store } from "./storage";
import type { StreamState, StreamStates, TabStates } from "./tab-states";

/** The browser APIs the router needs, so tests can pass fakes. */
export interface BrowserApis {
  tabs: { get(tabId: number): Promise<{ url?: string }> };
  permissions: { contains(permissions: { origins: string[] }): Promise<boolean> };
  /** Starts the reader script in a tab right away (after a site was enabled). */
  injectReader(tabId: number): Promise<unknown>;
}

export interface RouterDeps {
  extensionId: string;
  store: Store;
  outbox: Pick<Outbox, "enqueue" | "enqueueMany" | "flush" | "state">;
  recent: Pick<RecentReads, "claim" | "claimMany">;
  tabStates: TabStates;
  streamStates: StreamStates;
  api: Pick<ApiClient, "enableSource" | "ignoreSeries">;
  sync: () => Promise<unknown>;
  browser: BrowserApis;
  onUnauthorized: () => void;
  now?: () => number;
}

interface SenderLike {
  id?: string;
  url?: string;
  /** The tab's page; set by the browser where the extension may see it. */
  tab?: { id?: number; url?: string };
  frameId?: number;
}

/**
 * Message handling of the background worker. Content scripts may only report about the site they
 * run on; popup and options commands are accepted from the extension's own pages only.
 */
export function createRouter(deps: RouterDeps) {
  const now = deps.now ?? Date.now;
  const tabs = deps.tabStates;

  async function config(): Promise<DeviceConfig | null> {
    return (await loadCachedConfig(deps.store))?.config ?? null;
  }

  // The reported URL and the page the script actually runs on must belong to the same site.
  function siteFor(current: DeviceConfig | null, url: string, senderUrl: string | undefined): SiteRule | undefined {
    const site = findSiteForUrl(current, url);
    const senderSite = senderUrl ? findSiteForUrl(current, senderUrl) : undefined;
    return site && senderSite?.sourceKey === site.sourceKey ? site : undefined;
  }

  /** Queues one "read" event, at most once per series and chapter in 12 hours. */
  async function countRead(site: SiteRule, url: string, detection: Detection): Promise<"queued" | "duplicate"> {
    if (!(await deps.recent.claim(`${site.sourceKey}|${detection.seriesKey}|${detection.chapter}`, now()))) {
      return "duplicate";
    }
    const event = ProgressEvent.parse({
      id: crypto.randomUUID(),
      occurredAt: new Date(now()).toISOString(),
      kind: "read",
      source: {
        key: site.sourceKey,
        externalKey: detection.seriesKey,
        rawTitle: detection.title ?? detection.seriesKey,
        url,
        ...(detection.seriesUrl ? { seriesUrl: detection.seriesUrl } : {}),
        ...(detection.coverUrl ? { coverUrl: detection.coverUrl } : {}),
      },
      position: { unit: "chapter", chapter: detection.chapter },
    });
    await deps.outbox.enqueue(event);
    void deps.outbox.flush();
    return "queued";
  }

  /**
   * Queues one "watched" event, at most once per series and episode (or movie) in 12 hours. The
   * event is built first, so a detection that cannot become an event never uses up the dedupe.
   */
  async function countWatched({ service, url, detection }: StreamState): Promise<"queued" | "duplicate" | "none"> {
    if (!detection) return "none";
    const externalKey = streamingSeriesKey(detection.seriesTitle);
    const episode = detection.kind === "episode" && detection.episode !== null ? detection.episode : null;
    const seriesUrl = detection.seriesUrl && isServiceUrl(service, detection.seriesUrl) ? detection.seriesUrl : null;
    const event = ProgressEvent.safeParse({
      id: crypto.randomUUID(),
      occurredAt: new Date(now()).toISOString(),
      kind: "watched",
      source: { key: service, externalKey, rawTitle: detection.seriesTitle, url, ...(seriesUrl ? { seriesUrl } : {}) },
      position: episode === null ? { unit: "none" } : { unit: "episode", season: detection.season, episode },
      ...(episode === null ? { mediaTypeHint: "movie" } : {}),
    });
    if (!event.success) return "none";
    if (!(await deps.recent.claim(`${service}|${externalKey}|${detection.season ?? ""}|${episode ?? "movie"}`, now()))) {
      return "duplicate";
    }
    await deps.outbox.enqueue(event.data);
    void deps.outbox.flush();
    return "queued";
  }

  /** library_sync events for a history page: the furthest episode per series, never sent twice in 12 hours. */
  async function syncLibrary(service: StreamingServiceKey, rawEntries: unknown[]): Promise<number> {
    const entries = rawEntries.flatMap((raw) => {
      const entry = HistoryEntry.safeParse(raw);
      return entry.success ? [entry.data] : [];
    });
    const events: ProgressEvent[] = [];
    for (const { seriesTitle, season, episode, seriesUrl } of latestPerSeries(entries)) {
      const externalKey = streamingSeriesKey(seriesTitle);
      const event = ProgressEvent.safeParse({
        // The same history entry always gets the same id, however often the page is opened.
        id: await deterministicEventId(["library", service, externalKey, season ?? "", episode]),
        occurredAt: new Date(now()).toISOString(),
        kind: "library_sync",
        source: {
          key: service,
          externalKey,
          rawTitle: seriesTitle,
          ...(seriesUrl && isServiceUrl(service, seriesUrl) ? { seriesUrl } : {}),
        },
        position: { unit: "episode", season, episode },
      });
      if (event.success) events.push(event.data);
    }
    return queueOnce(events);
  }

  /** library_sync events for a WebNovel (chapters) or Kindle (percent) library page; other units are skipped. */
  async function syncAppLibrary(app: LibraryService, rawEntries: unknown[]): Promise<number> {
    const events: ProgressEvent[] = [];
    for (const raw of rawEntries) {
      const entry = LibraryEntry.safeParse(raw);
      if (!entry.success || !isAppBookKey(app, entry.data.externalKey)) continue;
      const { externalKey, title, chapter, percent, seriesUrl } = entry.data;
      const value = app === "webnovel" ? chapter : percent;
      if (value === undefined) continue;
      const event = ProgressEvent.safeParse({
        id: await deterministicEventId(["library", app, externalKey, value]),
        occurredAt: new Date(now()).toISOString(),
        kind: "library_sync",
        source: { key: app, externalKey, rawTitle: title, ...(seriesUrl && isServiceUrl(app, seriesUrl) ? { seriesUrl } : {}) },
        position: app === "webnovel" ? { unit: "chapter", chapter: value } : { unit: "percent", percent: value },
      });
      if (event.success) events.push(event.data);
    }
    return queueOnce(events);
  }

  /** Deterministic ids repeat when a page is opened again: what was sent in the last 12 hours is not queued again. */
  async function queueOnce(events: ProgressEvent[]): Promise<number> {
    const fresh = await deps.recent.claimMany(events.map((event) => `library|${event.id}`), now());
    const unsent = events.filter((event) => fresh.has(`library|${event.id}`));
    if (unsent.length > 0) {
      await deps.outbox.enqueueMany(unsent);
      void deps.outbox.flush();
    }
    return unsent.length;
  }

  async function handleContent(message: ContentMessage, tabId: number, sender: SenderLike) {
    const senderUrl = sender.url;
    const current = await config();
    // Streaming messages are accepted from the fixed service domains only, judged by the frame
    // the browser says sent them – not by what the script reports. Only frame 0 is the page itself.
    const service = senderUrl ? serviceForUrl(senderUrl) : undefined;
    const topFrame = sender.frameId === 0;
    const onPage = topFrame && service !== undefined && serviceForUrl(message.url)?.key === service.key;
    switch (message.type) {
      case "stream:hello": {
        if (!service) return { ok: false };
        // A page (re)load starts over: nothing an earlier page showed can be counted for it.
        if (onPage) await deps.streamStates.set(tabId, { service: service.key, url: message.url, detection: null });
        return { ok: true, watchedPercent: current?.thresholds.watchedPercent ?? DEFAULT_THRESHOLDS.watchedPercent };
      }

      case "stream:detected": {
        if (!onPage || !service) return { ok: false };
        const stored = await deps.streamStates.get(tabId);
        // A title overlay that fades out must not erase what this very page showed before.
        const keep = message.detection === null && stored?.service === service.key && stored.url === message.url;
        if (!keep) await deps.streamStates.set(tabId, { service: service.key, url: message.url, detection: message.detection });
        return { ok: true };
      }

      case "stream:watched": {
        if (!service) return { ok: false };
        const stored = await deps.streamStates.get(tabId);
        const storedHere = (url: string | undefined) => (stored?.service === service.key && stored.url === url ? stored.detection : null);
        let state: StreamState | null = null;
        if (onPage) {
          // The page itself says what it shows right now; the stored detection may be seconds old.
          const detection = message.detection ?? storedHere(message.url);
          if (detection) state = { service: service.key, url: message.url, detection };
        } else if (!topFrame) {
          // A player frame: the tab's page must still be this service's page the title was read on.
          const pageUrl = sender.tab?.url;
          const detection = pageUrl && serviceForUrl(pageUrl)?.key === service.key ? storedHere(pageUrl) : null;
          if (pageUrl && detection) state = { service: service.key, url: pageUrl, detection };
        }
        if (!state) return { ok: false };
        if (onPage) await deps.streamStates.set(tabId, state);
        const outcome = await countWatched(state);
        if (outcome === "none") return { ok: false };
        return outcome === "duplicate" ? { ok: true, duplicate: true } : { ok: true };
      }

      case "library:sync": {
        // A library page (SPEC §9.1/§9.2) is read by the page itself, on the app's own domain.
        const pageUrl = topFrame && senderUrl ? parseHttpUrl(senderUrl) : null;
        const app = pageUrl ? libraryServiceForUrl(pageUrl) : undefined;
        const reported = parseHttpUrl(message.url);
        if (!pageUrl || !app || !isLibraryPage(pageUrl) || !reported || libraryServiceForUrl(reported) !== app) return { ok: false };
        return { ok: true, queued: await syncAppLibrary(app, message.entries) };
      }

      case "stream:library": {
        // A history page (SPEC §7.6) is read by the page itself, never by a frame inside it.
        if (!onPage || !service || !senderUrl || !isHistoryPage(new URL(senderUrl))) return { ok: false };
        return { ok: true, queued: await syncLibrary(service.key, message.entries) };
      }

      case "reader:hello":
        return { ok: true, site: siteFor(current, message.url, senderUrl) ?? null, thresholds: current?.thresholds ?? DEFAULT_THRESHOLDS };

      case "reader:detected": {
        const site = siteFor(current, message.url, senderUrl);
        const previous = await tabs.get(tabId);
        await tabs.set(tabId, { url: message.url, sourceKey: site?.sourceKey ?? null, detection: message.detection, counted: false });
        // Signal 3 (SPEC §7.4): opening a higher chapter of the same series counts the previous one.
        if (
          site &&
          message.detection &&
          previous?.detection &&
          !previous.counted &&
          previous.sourceKey === site.sourceKey &&
          previous.detection.seriesKey === message.detection.seriesKey &&
          message.detection.chapter > previous.detection.chapter
        ) {
          await countRead(site, previous.url, previous.detection);
        }
        return { ok: true };
      }

      case "reader:chapter-read": {
        const site = siteFor(current, message.url, senderUrl);
        if (!site) return { ok: false };
        await tabs.set(tabId, { url: message.url, sourceKey: site.sourceKey, detection: message.detection, counted: true });
        return (await countRead(site, message.url, message.detection)) === "duplicate" ? { ok: true, duplicate: true } : { ok: true };
      }
    }
  }

  async function tabUrl(tabId: number): Promise<URL | null> {
    try {
      return parseHttpUrl((await deps.browser.tabs.get(tabId)).url);
    } catch {
      return null;
    }
  }

  async function popupStatus(tabId: number) {
    const [settings, current, outbox] = await Promise.all([loadSettings(deps.store), config(), deps.outbox.state()]);
    const url = await tabUrl(tabId);
    const site = url ? findSiteForUrl(current, url.href) : undefined;
    const state = await tabs.get(tabId);
    const sameTab = state && url && parseHttpUrl(state.url)?.hostname === url.hostname;
    const service = url ? serviceForUrl(url) : undefined;
    const stream = service ? await deps.streamStates.get(tabId) : null;
    return {
      ok: true,
      paired: settings.apiUrl !== null && settings.deviceToken !== null,
      watchedPercent: current?.thresholds.watchedPercent ?? DEFAULT_THRESHOLDS.watchedPercent,
      apiUrl: settings.apiUrl,
      page: url
        ? {
            url: url.href,
            origin: url.origin,
            domain: normalizeDomain(url.hostname),
            site: site ? { sourceKey: site.sourceKey, domains: site.domains } : null,
            permission: await deps.browser.permissions.contains({ origins: [`${url.origin}/*`] }),
            detection: sameTab ? state.detection : null,
            counted: sameTab ? state.counted : false,
            ignored: sameTab ? (state.ignored ?? false) : false,
            service: service ? { key: service.key, name: knownService(service.key)?.name ?? service.key } : null,
            stream: stream && stream.service === service?.key ? stream.detection : null,
          }
        : null,
      sites: (current?.sites ?? []).map(({ sourceKey, domains }) => ({ sourceKey, domains })),
      outbox: { queued: outbox.events.length, lastSyncAt: outbox.lastSyncAt, lastError: outbox.lastError },
    };
  }

  function refusal(result: { kind: string; status?: number }): string {
    if (result.kind === "unauthorized") return "Dieses Gerät ist nicht mehr gekoppelt.";
    if (result.status === 404) return "Die gewählte Seite gibt es im Tracker nicht mehr.";
    if (result.status === 409) return "Diese Domain gehört bereits zu einer anderen Seite.";
    if (result.kind === "rejected") return "Der Tracker hat die Anfrage abgelehnt.";
    return "Der Tracker ist gerade nicht erreichbar.";
  }

  async function handlePage(message: ExtensionPageMessage) {
    switch (message.type) {
      case "options:sync-now": {
        const result = await deps.sync();
        await deps.outbox.flush({ force: true });
        return { ok: true, result };
      }

      case "options:backfill": {
        const current = await config();
        const events: ProgressEvent[] = [];
        for (const entry of message.entries) {
          // Re-checked here: only enabled sites, whatever the options page sent.
          const site = findSiteForUrl(current, entry.url);
          if (!site) continue;
          const { detection } = entry;
          events.push(
            ProgressEvent.parse({
              id: await backfillEventId(site.sourceKey, detection.seriesKey, detection.chapter),
              occurredAt: new Date(entry.visitedAt > 0 ? entry.visitedAt : now()).toISOString(),
              kind: "backfill",
              source: {
                key: site.sourceKey,
                externalKey: detection.seriesKey,
                rawTitle: detection.title ?? detection.seriesKey,
                url: entry.url,
                ...(detection.seriesUrl ? { seriesUrl: detection.seriesUrl } : {}),
              },
              position: { unit: "chapter", chapter: detection.chapter },
            }),
          );
        }
        if (events.length > 0) {
          await deps.outbox.enqueueMany(events);
          void deps.outbox.flush();
        }
        return { ok: true, queued: events.length };
      }

      case "popup:status":
        return popupStatus(message.tabId);

      case "popup:enable-site": {
        const { apiUrl, deviceToken } = await loadSettings(deps.store);
        const url = await tabUrl(message.tabId);
        if (!apiUrl || !deviceToken) return { ok: false, error: "Bitte zuerst in den Einstellungen koppeln." };
        if (!url) return { ok: false, error: "Diese Seite kann nicht getrackt werden." };
        const result = await deps.api.enableSource(apiUrl, deviceToken, {
          origin: url.origin,
          ...(message.name ? { name: message.name } : {}),
          ...(message.moveFromSourceKey ? { moveFromSourceKey: message.moveFromSourceKey } : {}),
        });
        if (!result.ok) {
          if (result.kind === "unauthorized") deps.onUnauthorized();
          return { ok: false, error: refusal(result) };
        }
        await deps.sync(); // registers the reader for the new domain
        try {
          await deps.browser.injectReader(message.tabId);
        } catch {
          // e.g. the tab navigated away; the registered script takes over on the next page load
        }
        return { ok: true };
      }

      case "popup:ignore-series": {
        const { apiUrl, deviceToken } = await loadSettings(deps.store);
        const state = await tabs.get(message.tabId);
        if (!apiUrl || !deviceToken) return { ok: false, error: "Bitte zuerst in den Einstellungen koppeln." };
        if (!state?.detection || !state.sourceKey) return { ok: false, error: "Hier wurde keine Serie erkannt." };
        const result = await deps.api.ignoreSeries(apiUrl, deviceToken, {
          sourceKey: state.sourceKey,
          externalKey: state.detection.seriesKey,
          rawTitle: state.detection.title ?? state.detection.seriesKey,
        });
        if (!result.ok) return { ok: false, error: refusal(result) };
        await tabs.set(message.tabId, { ...state, ignored: true });
        return { ok: true };
      }
    }
  }

  return async function route(raw: unknown, sender: SenderLike): Promise<unknown> {
    const from = classifySender(sender, deps.extensionId);
    if (from.kind === "content") {
      const message = ContentMessage.safeParse(raw);
      return message.success ? handleContent(message.data, from.tabId, sender) : { ok: false };
    }
    if (from.kind === "page") {
      const message = ExtensionPageMessage.safeParse(raw);
      return message.success ? handlePage(message.data) : { ok: false };
    }
    return { ok: false };
  };
}
