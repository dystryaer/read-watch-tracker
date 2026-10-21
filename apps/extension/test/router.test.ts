import type { DeviceConfig, ProgressEvent } from "@rwt/core";
import { describe, expect, it, vi } from "vitest";
import { RecentReads } from "../src/lib/recent";
import { createRouter } from "../src/lib/router";
import { saveCachedConfig, saveSettings } from "../src/lib/settings";
import { createStore, type StorageArea } from "../src/lib/storage";
import { createStreamStates, createTabStates } from "../src/lib/tab-states";
import { fakeStorage } from "./fakes";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const config: DeviceConfig = {
  sites: [
    { sourceKey: "site:asura", domains: ["asuracomic.net"], chapterPattern: String.raw`/chapter/(\d+)` },
    { sourceKey: "site:other", domains: ["other.example"] },
  ],
  thresholds: { scrollDepthPercent: 60, watchedPercent: 85 },
};
const detection = { chapter: 345, seriesKey: "overgeared", title: "Overgeared", seriesUrl: "https://asuracomic.net/series/overgeared" };
const chapterUrl = "https://asuracomic.net/series/overgeared/chapter/345";
const content = (url = chapterUrl) => ({ id: EXT, tab: { id: 4 }, url });
const page = { id: EXT, url: `chrome-extension://${EXT}/popup.html` };

const paired = { apiUrl: "https://tracker.example", deviceToken: "T".repeat(43), deviceName: "Brave", pairing: null };

async function setup(options: { paired?: boolean; tabUrl?: string; permission?: boolean; session?: StorageArea } = {}) {
  const store = createStore(fakeStorage());
  const sessionStore = createStore(options.session ?? fakeStorage());
  await saveCachedConfig(store, { config, etag: null, fetchedAt: 0 });
  if (options.paired !== false) await saveSettings(store, paired);
  const queued: ProgressEvent[] = [];
  const outbox = {
    enqueue: vi.fn(async (event: ProgressEvent) => {
      queued.push(event);
    }),
    enqueueMany: vi.fn(async (events: ProgressEvent[]) => {
      queued.push(...events);
    }),
    flush: vi.fn(async () => ({ sent: 0, remaining: 0 })),
    state: vi.fn(async () => ({ events: queued, attempts: 0, nextAttemptAt: null, lastSyncAt: 5, lastError: null, dropped: 0 })),
  };
  const sync = vi.fn(async () => "updated");
  const api = {
    enableSource: vi.fn(async () => ({ ok: true as const, value: { sourceKey: "site:new-example", name: "new.example", domains: ["new.example"] } })),
    ignoreSeries: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
  };
  const browser = {
    tabs: { get: vi.fn(async () => ({ url: options.tabUrl ?? chapterUrl })) },
    permissions: { contains: vi.fn(async () => options.permission ?? true) },
    injectReader: vi.fn(async () => []),
  };
  const route = createRouter({
    extensionId: EXT,
    store,
    outbox,
    recent: new RecentReads(store),
    tabStates: createTabStates(sessionStore),
    streamStates: createStreamStates(sessionStore),
    api,
    sync,
    browser,
    onUnauthorized: vi.fn(),
    now: () => Date.parse("2026-10-21T20:00:00.000Z"),
  });
  return { route, queued, outbox, sync, api, browser };
}

describe("router – reader script", () => {
  it("answers hello with the site rule and thresholds", async () => {
    const { route } = await setup();
    expect(await route({ type: "reader:hello", url: chapterUrl }, content())).toEqual({
      ok: true,
      site: config.sites[0],
      thresholds: config.thresholds,
    });
  });

  it("turns a chapter read into a queued event and sends it", async () => {
    const { route, queued, outbox } = await setup();

    expect(await route({ type: "reader:chapter-read", url: chapterUrl, detection, signal: "scroll" }, content())).toEqual({ ok: true });

    expect(queued).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        occurredAt: "2026-10-21T20:00:00.000Z",
        kind: "read",
        source: {
          key: "site:asura",
          externalKey: "overgeared",
          rawTitle: "Overgeared",
          url: chapterUrl,
          seriesUrl: "https://asuracomic.net/series/overgeared",
        },
        position: { unit: "chapter", chapter: 345 },
      },
    ]);
    expect(outbox.flush).toHaveBeenCalled();
  });

  it("uses the series key as title when the page had none", async () => {
    const { route, queued } = await setup();
    await route({ type: "reader:chapter-read", url: chapterUrl, detection: { ...detection, title: null }, signal: "end-visible" }, content());
    expect(queued[0]?.source.rawTitle).toBe("overgeared");
  });

  it("sends the same chapter only once within 12 hours", async () => {
    const { route, queued } = await setup();
    const message = { type: "reader:chapter-read", url: chapterUrl, detection, signal: "scroll" };

    await route(message, content());
    expect(await route(message, content())).toEqual({ ok: true, duplicate: true });

    expect(queued).toHaveLength(1);
  });

  it("ignores reports for a site that is not enabled", async () => {
    const { route, queued } = await setup();
    const url = "https://unknown.example/manga/x/chapter-1";
    expect(await route({ type: "reader:chapter-read", url, detection, signal: "scroll" }, content(url))).toEqual({ ok: false });
    expect(queued).toHaveLength(0);
  });

  it("ignores a script that reports for another site than the one it runs on", async () => {
    const { route, queued } = await setup();
    const result = await route(
      { type: "reader:chapter-read", url: chapterUrl, detection, signal: "scroll" },
      content("https://other.example/page"),
    );
    expect(result).toEqual({ ok: false });
    expect(queued).toHaveLength(0);
  });

  it("counts the previous chapter when the reader moves on to a higher one in the same tab", async () => {
    const { route, queued } = await setup();
    const next = { ...detection, chapter: 346 };
    const nextUrl = "https://asuracomic.net/series/overgeared/chapter/346";

    await route({ type: "reader:detected", url: chapterUrl, detection }, content());
    await route({ type: "reader:detected", url: nextUrl, detection: next }, content(nextUrl));

    expect(queued.map((e) => e.position)).toEqual([{ unit: "chapter", chapter: 345 }]);
    expect(queued[0]?.source.url).toBe(chapterUrl);
  });

  it("does not count on a jump back, to another series or after the chapter was counted", async () => {
    const { route, queued } = await setup();
    const at = (chapter: number, seriesKey = "overgeared") => ({
      url: `https://asuracomic.net/series/${seriesKey}/chapter/${chapter}`,
      detection: { ...detection, chapter, seriesKey },
    });
    const detected = async (step: ReturnType<typeof at>) =>
      route({ type: "reader:detected", ...step }, content(step.url));

    await detected(at(345));
    await detected(at(340)); // back
    await detected(at(1, "solo-leveling")); // other series
    await route({ type: "reader:chapter-read", ...at(2, "solo-leveling"), signal: "scroll" }, content(at(2, "solo-leveling").url));
    await detected(at(3, "solo-leveling")); // previous already counted

    expect(queued.map((e) => `${e.source.externalKey}:${(e.position as { chapter: number }).chapter}`)).toEqual(["solo-leveling:2"]);
  });

  it("does not accept popup commands from a content script", async () => {
    const { route, sync } = await setup();
    expect(await route({ type: "options:sync-now" }, content())).toEqual({ ok: false });
    expect(sync).not.toHaveBeenCalled();
  });

  it("rejects malformed messages", async () => {
    const { route } = await setup();
    expect(await route({ type: "reader:chapter-read", url: "javascript:alert(1)", detection, signal: "scroll" }, content())).toEqual({
      ok: false,
    });
  });
});

describe("router – extension pages", () => {
  it("runs a sync on request from the options page", async () => {
    const { route, sync } = await setup();
    expect(await route({ type: "options:sync-now" }, page)).toEqual({ ok: true, result: "updated" });
    expect(sync).toHaveBeenCalled();
  });

  it("ignores messages from other extensions", async () => {
    const { route, sync } = await setup();
    expect(await route({ type: "options:sync-now" }, { id: "x".repeat(32), url: "chrome-extension://x/" })).toEqual({ ok: false });
    expect(sync).not.toHaveBeenCalled();
  });
});

describe("router – popup", () => {
  it("describes an enabled site with the tab's detection", async () => {
    const { route } = await setup();
    await route({ type: "reader:detected", url: chapterUrl, detection }, content());

    const status = await route({ type: "popup:status", tabId: 4 }, page);

    expect(status).toMatchObject({
      ok: true,
      paired: true,
      page: {
        origin: "https://asuracomic.net",
        domain: "asuracomic.net",
        site: { sourceKey: "site:asura" },
        permission: true,
        detection,
        counted: false,
        ignored: false,
      },
      outbox: { queued: 0, lastSyncAt: 5, lastError: null },
    });
  });

  it("describes a site that is not enabled and lists sites to move from", async () => {
    const { route } = await setup({ tabUrl: "https://new.example/manga/x/chapter-1", permission: false });
    const status = await route({ type: "popup:status", tabId: 4 }, page);
    expect(status).toMatchObject({ page: { site: null, permission: false, domain: "new.example" } });
    expect((status as { sites: unknown[] }).sites).toHaveLength(2);
  });

  it("has no page for non-http tabs", async () => {
    const { route } = await setup({ tabUrl: "chrome://extensions" });
    expect(await route({ type: "popup:status", tabId: 4 }, page)).toMatchObject({ page: null });
  });

  it("enables the tab's site on the server, resyncs and starts the reader right away", async () => {
    const { route, api, sync, browser } = await setup({ tabUrl: "https://new.example/manga/x/chapter-1" });

    const result = await route({ type: "popup:enable-site", tabId: 4, name: "New" }, page);

    expect(result).toEqual({ ok: true });
    expect(api.enableSource).toHaveBeenCalledWith(paired.apiUrl, paired.deviceToken, { origin: "https://new.example", name: "New" });
    expect(sync).toHaveBeenCalled();
    expect(browser.injectReader).toHaveBeenCalledWith(4);
  });

  it("passes a domain move on to the server", async () => {
    const { route, api } = await setup({ tabUrl: "https://asurascans.com/series/x/chapter/1" });
    await route({ type: "popup:enable-site", tabId: 4, moveFromSourceKey: "site:asura" }, page);
    expect(api.enableSource).toHaveBeenCalledWith(paired.apiUrl, paired.deviceToken, {
      origin: "https://asurascans.com",
      moveFromSourceKey: "site:asura",
    });
  });

  it("explains a refused domain move", async () => {
    const { route, api } = await setup({ tabUrl: "https://asurascans.com/" });
    api.enableSource.mockResolvedValueOnce({ ok: false, kind: "rejected", message: "x", status: 409 } as never);
    expect(await route({ type: "popup:enable-site", tabId: 4, moveFromSourceKey: "site:asura" }, page)).toEqual({
      ok: false,
      error: "Diese Domain gehört bereits zu einer anderen Seite.",
    });
  });

  it("refuses to enable a site while unpaired", async () => {
    const { route, api } = await setup({ paired: false });
    expect(await route({ type: "popup:enable-site", tabId: 4 }, page)).toMatchObject({ ok: false });
    expect(api.enableSource).not.toHaveBeenCalled();
  });

  it("ignores the detected series of the tab", async () => {
    const { route, api } = await setup();
    await route({ type: "reader:detected", url: chapterUrl, detection }, content());

    expect(await route({ type: "popup:ignore-series", tabId: 4 }, page)).toEqual({ ok: true });

    expect(api.ignoreSeries).toHaveBeenCalledWith(paired.apiUrl, paired.deviceToken, {
      sourceKey: "site:asura",
      externalKey: "overgeared",
      rawTitle: "Overgeared",
    });
    expect(await route({ type: "popup:status", tabId: 4 }, page)).toMatchObject({ page: { ignored: true } });
  });
});

describe("router – backfill", () => {
  it("queues one backfill event per entry with a deterministic id", async () => {
    const { route, queued } = await setup();
    const entry = { url: chapterUrl, visitedAt: Date.parse("2026-09-01T10:00:00.000Z"), detection };

    expect(await route({ type: "options:backfill", entries: [entry] }, page)).toEqual({ ok: true, queued: 1 });
    await route({ type: "options:backfill", entries: [entry] }, page);

    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({ kind: "backfill", occurredAt: "2026-09-01T10:00:00.000Z", source: { key: "site:asura" } });
    expect(queued[1]?.id).toBe(queued[0]?.id);
  });

  it("skips entries of sites that are not enabled", async () => {
    const { route, queued } = await setup();
    const entry = { url: "https://unknown.example/manga/x/chapter-1", visitedAt: 0, detection };
    expect(await route({ type: "options:backfill", entries: [entry] }, page)).toEqual({ ok: true, queued: 0 });
    expect(queued).toHaveLength(0);
  });

  it("is not accepted from a content script", async () => {
    const { route } = await setup();
    expect(await route({ type: "options:backfill", entries: [] }, content())).toEqual({ ok: false });
  });
});

describe("router – service worker restarts", () => {
  const next = { ...detection, chapter: 346 };
  const nextUrl = chapterUrl.replace("345", "346");

  it("still counts the previous chapter after the worker was stopped while reading", async () => {
    const session = fakeStorage();
    const before = await setup({ session });
    await before.route({ type: "reader:detected", url: chapterUrl, detection }, content());

    const after = await setup({ session }); // fresh worker: memory gone, session storage kept
    await after.route({ type: "reader:detected", url: nextUrl, detection: next }, content(nextUrl));

    expect(after.queued.map((event) => event.position)).toEqual([{ unit: "chapter", chapter: 345 }]);
  });

  it("still knows the series for the popup and for ignoring it", async () => {
    const session = fakeStorage();
    await (await setup({ session })).route({ type: "reader:detected", url: chapterUrl, detection }, content());

    const after = await setup({ session });

    expect(await after.route({ type: "popup:status", tabId: 4 }, page)).toMatchObject({ page: { detection } });
    expect(await after.route({ type: "popup:ignore-series", tabId: 4 }, page)).toEqual({ ok: true });
  });

  it("does not trust a tampered tab state", async () => {
    const session = fakeStorage({ "tab:4": { url: "javascript:alert(1)", sourceKey: "site:asura", detection, counted: false } });
    const { route } = await setup({ session });

    expect(await route({ type: "popup:status", tabId: 4 }, page)).toMatchObject({ page: { detection: null } });
  });
});

describe("router – desktop streaming", () => {
  const watchUrl = "https://www.netflix.com/watch/81234567";
  const netflix = (url = watchUrl, frameId = 0) => ({ id: EXT, tab: { id: 7 }, url, frameId });
  const dark = { kind: "episode" as const, seriesTitle: "Dark (German Dub)", season: 2, episode: 5 };

  it("tells a streaming page the watched threshold", async () => {
    const { route } = await setup();
    expect(await route({ type: "stream:hello", url: watchUrl }, netflix())).toEqual({ ok: true, watchedPercent: 85 });
  });

  it("turns a watched episode into a queued event under the normalized series key", async () => {
    const { route, queued } = await setup();
    await route({ type: "stream:detected", url: watchUrl, detection: dark }, netflix());

    expect(await route({ type: "stream:watched", url: watchUrl }, netflix())).toEqual({ ok: true });

    expect(queued).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        occurredAt: "2026-10-21T20:00:00.000Z",
        kind: "watched",
        source: { key: "netflix", externalKey: "dark", rawTitle: "Dark (German Dub)", url: watchUrl },
        position: { unit: "episode", season: 2, episode: 5 },
      },
    ]);
  });

  it("counts an episode only once", async () => {
    const { route, queued } = await setup();
    await route({ type: "stream:detected", url: watchUrl, detection: dark }, netflix());
    await route({ type: "stream:watched", url: watchUrl }, netflix());

    expect(await route({ type: "stream:watched", url: watchUrl }, netflix())).toEqual({ ok: true, duplicate: true });
    expect(queued).toHaveLength(1);
  });

  it("takes the progress from the player frame and the title from the page (Crunchyroll)", async () => {
    const { route, queued } = await setup();
    const page = "https://www.crunchyroll.com/watch/GXYZ/phantoms";
    const frame = "https://static.crunchyroll.com/vilos-v2/web/vilos/player.html";
    const frieren = { kind: "episode" as const, seriesTitle: "Frieren", season: null, episode: 5 };
    await route({ type: "stream:detected", url: page, detection: frieren }, netflix(page));

    await route({ type: "stream:watched", url: frame }, netflix(frame, 3));

    expect(queued.map((event) => [event.source.key, event.position])).toEqual([["crunchyroll", { unit: "episode", season: null, episode: 5 }]]);
  });

  it("sends a watched movie without a position, marked as a movie", async () => {
    const { route, queued } = await setup();
    const movie = { kind: "movie" as const, seriesTitle: "Glass Onion", season: null, episode: null };
    await route({ type: "stream:detected", url: watchUrl, detection: movie }, netflix());
    await route({ type: "stream:watched", url: watchUrl }, netflix());

    expect(queued[0]).toMatchObject({ position: { unit: "none" }, mediaTypeHint: "movie" });
  });

  it("keeps the detection when the worker is restarted during the episode", async () => {
    const session = fakeStorage();
    await (await setup({ session })).route({ type: "stream:detected", url: watchUrl, detection: dark }, netflix());

    const after = await setup({ session });
    await after.route({ type: "stream:watched", url: watchUrl }, netflix());

    expect(after.queued).toHaveLength(1);
  });

  it.each([
    ["a page that is no streaming service", { type: "stream:detected", url: chapterUrl, detection: dark }, content()],
    ["a sender whose page does not match the reported URL", { type: "stream:detected", url: watchUrl, detection: dark }, netflix("https://www.disneyplus.com/video/1")],
    ["a frame inside the page", { type: "stream:detected", url: watchUrl, detection: dark }, netflix(watchUrl, 2)],
  ])("refuses a detection from %s", async (_name, message, sender) => {
    const { route, queued } = await setup();
    expect(await route(message, sender)).toEqual({ ok: false });
    await route({ type: "stream:watched", url: watchUrl }, netflix());
    expect(queued).toHaveLength(0);
  });

  it("shows the popup which service the tab is on and what it plays", async () => {
    const { route } = await setup({ tabUrl: watchUrl });
    await route({ type: "stream:detected", url: watchUrl, detection: dark }, netflix());

    expect(await route({ type: "popup:status", tabId: 7 }, page)).toMatchObject({
      page: { site: null, service: { key: "netflix", name: "Netflix" }, stream: dark },
    });
  });

  it("tells the popup that a manga page is no streaming service", async () => {
    const { route } = await setup();
    expect(await route({ type: "popup:status", tabId: 4 }, page)).toMatchObject({ page: { service: null, stream: null } });
  });

  it("ignores a watched signal without a detection on that tab", async () => {
    const { route, queued } = await setup();
    expect(await route({ type: "stream:watched", url: watchUrl }, netflix())).toEqual({ ok: false });
    expect(queued).toHaveLength(0);
  });

  it("drops a detection that does not fit the message contract", async () => {
    const { route } = await setup();
    const broken = { ...dark, episode: null };
    expect(await route({ type: "stream:detected", url: watchUrl, detection: broken }, netflix())).toEqual({ ok: false });
  });
});

describe("router – history sync", () => {
  const historyUrl = "https://www.crunchyroll.com/history";
  const crunchyroll = (url = historyUrl, frameId = 0) => ({ id: EXT, tab: { id: 9 }, url, frameId });
  const entries = [
    { seriesTitle: "Frieren", season: 1, episode: 5 },
    { seriesTitle: "Frieren", season: 1, episode: 7 },
    { seriesTitle: "Dandadan (German Dub)", season: null, episode: 12 },
  ];

  it("queues the latest episode per series as library_sync events", async () => {
    const { route, queued } = await setup();

    expect(await route({ type: "stream:library", url: historyUrl, entries }, crunchyroll())).toEqual({ ok: true, queued: 2 });

    expect(queued.map((event) => [event.kind, event.source.key, event.source.externalKey, event.position])).toEqual([
      ["library_sync", "crunchyroll", "frieren", { unit: "episode", season: 1, episode: 7 }],
      ["library_sync", "crunchyroll", "dandadan", { unit: "episode", season: null, episode: 12 }],
    ]);
  });

  it("sends the same ids when the history is opened again, so the server counts nothing twice", async () => {
    const first = await setup();
    const second = await setup();
    await first.route({ type: "stream:library", url: historyUrl, entries }, crunchyroll());
    await second.route({ type: "stream:library", url: historyUrl, entries }, crunchyroll());

    expect(second.queued.map((event) => event.id)).toEqual(first.queued.map((event) => event.id));
  });

  it.each([
    ["a page that is no streaming service", content()],
    ["a frame inside the page", crunchyroll(historyUrl, 4)],
  ])("refuses a history from %s", async (_name, sender) => {
    const { route, queued } = await setup();
    expect(await route({ type: "stream:library", url: historyUrl, entries }, sender)).toEqual({ ok: false });
    expect(queued).toHaveLength(0);
  });
});
