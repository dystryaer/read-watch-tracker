import type { DeviceConfig, ProgressEvent } from "@rwt/core";
import { describe, expect, it, vi } from "vitest";
import { RecentReads } from "../src/lib/recent";
import { createRouter } from "../src/lib/router";
import { saveCachedConfig } from "../src/lib/settings";
import { createStore } from "../src/lib/storage";
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

async function setup() {
  const store = createStore(fakeStorage());
  await saveCachedConfig(store, { config, etag: null, fetchedAt: 0 });
  const queued: ProgressEvent[] = [];
  const outbox = {
    enqueue: vi.fn(async (event: ProgressEvent) => {
      queued.push(event);
    }),
    flush: vi.fn(async () => ({ sent: 0, remaining: 0 })),
    state: vi.fn(),
  };
  const sync = vi.fn(async () => "updated");
  const route = createRouter({
    extensionId: EXT,
    store,
    outbox,
    recent: new RecentReads(store),
    api: { enableSource: vi.fn() },
    sync,
    browser: { tabs: { get: vi.fn() }, permissions: { contains: vi.fn() } },
    now: () => Date.parse("2026-10-21T20:00:00.000Z"),
  });
  return { route, queued, outbox, sync };
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
