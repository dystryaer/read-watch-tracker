import type { DeviceConfig, SeriesWatchResponse } from "@rwt/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ApiResult } from "../src/lib/api-client";
import { checkNewChapters, loadNewChapterChecks, saveNewChapterChecks } from "../src/lib/new-chapters";
import { saveCachedConfig, saveSettings } from "../src/lib/settings";
import { createStore } from "../src/lib/storage";
import { fakeStorage } from "./fakes";

// Synthetic series pages (A11).
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const paired = { apiUrl: "https://tracker.example", deviceToken: "T".repeat(43), deviceName: "Brave", pairing: null };
const config: DeviceConfig = {
  sites: [{ sourceKey: "site:asura", domains: ["asuracomic.net", "asurascans.com", "host0.example", "host1.example", "host2.example", "host3.example"] }],
  thresholds: { scrollDepthPercent: 60, watchedPercent: 85 },
};
type Series = SeriesWatchResponse["series"][number];

const watched = (key: string, chapter = 200, host = "asuracomic.net"): Series => ({
  sourceKey: "site:asura",
  externalKey: key,
  seriesUrl: `https://${host}/series/${key}`,
  chapter,
});
const listing = (key: string, latest: number) =>
  `<ul><li><a href="/series/${key}/chapter-${latest}">Chapter ${latest}</a></li><li><a href="/series/${key}/chapter-${latest - 1}">Chapter ${latest - 1}</a></li></ul>`;
const listingFor = (url: string) => html(listing(url.split("/").pop() ?? "", 203));

function html(body: string | ReadableStream<Uint8Array>, init: { status?: number; type?: string; length?: number; redirectedTo?: string } = {}): Response {
  const headers: Record<string, string> = { "content-type": init.type ?? "text/html; charset=utf-8" };
  if (init.length !== undefined) headers["content-length"] = String(init.length);
  const response = new Response(body, { status: init.status ?? 200, headers });
  if (init.redirectedTo) {
    Object.defineProperty(response, "redirected", { value: true });
    Object.defineProperty(response, "url", { value: init.redirectedTo });
  }
  return response;
}

async function setup(
  series: Series[],
  pages: Record<string, () => Response | Promise<Response>> = {},
  options: { granted?: boolean; sites?: DeviceConfig["sites"] } = {},
) {
  const store = createStore(fakeStorage());
  await saveSettings(store, paired);
  await saveCachedConfig(store, { config: { ...config, sites: options.sites ?? config.sites }, etag: null, fetchedAt: 0 });
  let now = 1_000_000_000;
  let online = true;
  const deps = {
    store,
    api: {
      getSeriesWatch: vi.fn(async (): Promise<ApiResult<SeriesWatchResponse>> => ({ ok: true, value: { series } })),
      postLatestChapters: vi.fn<(apiUrl: string, token: string, items: unknown) => Promise<ApiResult<{ updated: number }>>>(async () => ({
        ok: true,
        value: { updated: 1 },
      })),
    },
    fetchPage: vi.fn(async (url: string) => (pages[url] ?? (() => html("", { status: 404 })))()),
    permissions: { contains: vi.fn<(request: { origins: string[] }) => Promise<boolean>>(async () => options.granted ?? true) },
    isOnline: () => online,
    now: () => now,
    sleep: vi.fn<(ms: number) => Promise<void>>(async () => {}),
    onUnauthorized: vi.fn(),
  };
  return {
    deps,
    advance: (ms: number) => (now += ms),
    setOnline: (value: boolean) => (online = value),
  };
}

const fetched = (deps: Awaited<ReturnType<typeof setup>>["deps"]) => deps.fetchPage.mock.calls.map(([url]) => url);

describe("checkNewChapters (SPEC §7.11)", () => {
  it("reports the newest chapter each watched series page links to", async () => {
    const solo = watched("solo-leveling");
    const omni = watched("omniscient-reader", 100);
    const { deps } = await setup([solo, omni], {
      [solo.seriesUrl]: () => html(listing("solo-leveling", 203)),
      [omni.seriesUrl]: () => html(listing("omniscient-reader", 100)),
    });

    expect(await checkNewChapters(deps)).toEqual({ checked: 2, reported: 2 });
    expect(deps.api.postLatestChapters).toHaveBeenCalledWith("https://tracker.example", "T".repeat(43), [
      { sourceKey: "site:asura", externalKey: "solo-leveling", latestChapter: 203 },
      { sourceKey: "site:asura", externalKey: "omniscient-reader", latestChapter: 100 },
    ]);
  });

  it("reads a series page whose chapter links name the chapter only in the query, with the site's chapter link pattern", async () => {
    // Synthetic page shaped like a list of links to a redirect script (A11), with a sidebar of another series.
    const sites: DeviceConfig["sites"] = [
      { sourceKey: "site:scans", domains: ["scans.example"], seriesUrlTemplate: "{origin}/manga/{series}", chapterLinkPattern: String.raw`[?&]chapter=(\d+(?:\.\d+)?)` },
    ];
    const solo: Series = { sourceKey: "site:scans", externalKey: "solo-leveling", seriesUrl: "https://scans.example/manga/Solo-Leveling", chapter: 200 };
    const link = (manga: number, chapter: number) => `<li><a  href="/chaptered.php?manga=${manga}&amp;chapter=${chapter}" class="chplinks">Chapter ${chapter}</a></li>`;
    const page = `<a id="read-first" href="/chaptered.php?manga=6&chapter=0">Read first</a>
      <aside>${link(9, 410)}${link(9, 409)}</aside>
      <div id="chapters-list">${[200.5, 200, 199, 198].map((chapter) => link(6, chapter)).join("")}</div>`;
    const { deps } = await setup([solo], { [solo.seriesUrl]: () => html(page) }, { sites });

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 1 });
    expect(deps.api.postLatestChapters).toHaveBeenCalledWith(expect.any(String), expect.any(String), [
      { sourceKey: "site:scans", externalKey: "solo-leveling", latestChapter: 200.5 },
    ]);
  });

  it("does not report a page that lists less than I have read: only part of the list", async () => {
    const solo = watched("solo-leveling", 200);
    const { deps } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 50)) });

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 0 });
    expect(deps.api.postLatestChapters).not.toHaveBeenCalled();
  });

  it("checks each series at most once a day", async () => {
    const solo = watched("solo-leveling");
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });

    await checkNewChapters(deps);
    advance(23 * HOUR);
    await checkNewChapters(deps);
    expect(deps.fetchPage).toHaveBeenCalledTimes(1);

    advance(2 * HOUR);
    await checkNewChapters(deps);
    expect(deps.fetchPage).toHaveBeenCalledTimes(2);
  });

  it("checks at most 10 series per run, one after another with 3 s pause", async () => {
    const many = Array.from({ length: 12 }, (_, index) => watched(`series-${index}`, 200, `host${index % 4}.example`));
    const { deps } = await setup(many);

    await checkNewChapters(deps);

    expect(deps.fetchPage).toHaveBeenCalledTimes(10);
    expect(deps.sleep).toHaveBeenCalledTimes(9);
    expect(deps.sleep).toHaveBeenCalledWith(3000);
  });

  it("checks never-checked series first, so the end of a long list is not starved", async () => {
    const many = Array.from({ length: 12 }, (_, index) => watched(`series-${index}`, 200, `host${index % 4}.example`));
    const { deps, advance } = await setup(many);

    await checkNewChapters(deps);
    advance(HOUR);
    await checkNewChapters(deps);

    expect(fetched(deps).slice(10)).toEqual([many[10]?.seriesUrl, many[11]?.seriesUrl]);
  });

  it("claims a series before fetching it: a run that dies in the middle does not repeat it within the day", async () => {
    const solo = watched("solo-leveling");
    const omni = watched("omniscient-reader");
    const { deps, advance } = await setup([solo, omni]);
    deps.fetchPage.mockImplementationOnce(async (url: string) => listingFor(url));
    // The service worker is stopped while this request hangs.
    deps.fetchPage.mockImplementationOnce(() => new Promise<Response>(() => {}));

    void checkNewChapters(deps);
    await vi.waitFor(() => expect(deps.fetchPage).toHaveBeenCalledTimes(2));
    advance(HOUR);
    deps.fetchPage.mockImplementation(async (url: string) => listingFor(url));
    await checkNewChapters(deps);

    expect(deps.fetchPage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a bot check", () => html(`<html><head><title>Just a moment...</title></head></html>`)],
    ["a redirect to another site", () => html(listing("solo-leveling", 203), { redirectedTo: "https://parked.example/" })],
    ["an error status", () => html("", { status: 503 })],
    ["something else than HTML", () => html("{}", { type: "application/json" })],
    ["an oversized page by its header", () => html(listing("solo-leveling", 203), { length: 3 * 1024 * 1024 })],
    [
      "an oversized page without a header",
      () =>
        html(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const chunk = new Uint8Array(512 * 1024).fill(32);
              for (let index = 0; index < 5; index++) controller.enqueue(chunk);
              controller.close();
            },
          }),
        ),
    ],
  ])("skips %s, reports nothing and waits 7 days", async (_name, response) => {
    const solo = watched("solo-leveling");
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: response });

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 0 });
    expect(deps.api.postLatestChapters).not.toHaveBeenCalled();
    advance(6 * DAY);
    await checkNewChapters(deps);
    expect(deps.fetchPage).toHaveBeenCalledTimes(1);
    advance(DAY + HOUR);
    await checkNewChapters(deps);
    expect(deps.fetchPage).toHaveBeenCalledTimes(2);
  });

  it("asks the browser not to follow redirects, and skips one: it could lead anywhere, even into my home network", async () => {
    const solo = watched("solo-leveling");
    const opaque = html("");
    Object.defineProperty(opaque, "status", { value: 0 });
    Object.defineProperty(opaque, "type", { value: "opaqueredirect" });
    const { deps } = await setup([solo], { [solo.seriesUrl]: () => opaque });

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 0 });
    expect(deps.fetchPage).toHaveBeenCalledWith(solo.seriesUrl);
  });

  it("checks only https pages (plain http only on this machine)", async () => {
    const insecure: Series = { ...watched("solo-leveling"), seriesUrl: "http://asuracomic.net/series/solo-leveling" };
    const { deps } = await setup([insecure]);

    await checkNewChapters(deps);

    expect(deps.fetchPage).not.toHaveBeenCalled();
  });

  it("sends at most 3 requests to one site per run", async () => {
    const asura = Array.from({ length: 5 }, (_, index) => watched(`asura-${index}`));
    const scans = Array.from({ length: 2 }, (_, index) => watched(`scans-${index}`, 200, "asurascans.com"));
    const { deps } = await setup([...asura, ...scans]);

    await checkNewChapters(deps);

    const hosts = fetched(deps).map((url) => new URL(url).hostname);
    expect(hosts.filter((host) => host === "asuracomic.net")).toHaveLength(3);
    expect(hosts.filter((host) => host === "asurascans.com")).toHaveLength(2);
  });

  it("treats a schedule entry far in the future as due: a clock that once jumped ahead does not stop the checks", async () => {
    const solo = watched("solo-leveling");
    const { deps } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });
    await deps.store.write("newChapterSchedule", { "site:asura|solo-leveling": { url: solo.seriesUrl, next: 1_000_000_000 + 365 * DAY } });

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 1 });
  });

  it("tries again tomorrow when the connection breaks while the page loads", async () => {
    const solo = watched("solo-leveling");
    const broken = () =>
      html(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new TypeError("network error"));
          },
        }),
      );
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: broken });

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 0 });
    advance(DAY + HOUR);
    await checkNewChapters(deps);
    expect(deps.fetchPage).toHaveBeenCalledTimes(2);
  });

  it("drops results the tracker refuses for good instead of sending them forever", async () => {
    const solo = watched("solo-leveling");
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });
    deps.api.postLatestChapters.mockResolvedValueOnce({ ok: false, kind: "rejected", message: "Server lehnt ab (400)", status: 400 });

    await checkNewChapters(deps);
    advance(HOUR);
    await checkNewChapters(deps);

    expect(deps.api.postLatestChapters).toHaveBeenCalledTimes(1);
  });

  it("tries again the next day when a site does not answer, not after 7 days", async () => {
    const solo = watched("solo-leveling");
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: () => Promise.reject(new DOMException("timed out", "TimeoutError")) });

    await checkNewChapters(deps);
    advance(DAY + HOUR);
    await checkNewChapters(deps);

    expect(deps.fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops without penalty when the browser went offline: no back-off, checked again within the hour", async () => {
    const { deps, advance, setOnline } = await setup([watched("solo-leveling"), watched("omniscient-reader")]);
    deps.fetchPage.mockImplementation(async () => {
      setOnline(false);
      throw new TypeError("Failed to fetch");
    });

    await checkNewChapters(deps);
    expect(deps.fetchPage).toHaveBeenCalledTimes(1);

    setOnline(true);
    deps.fetchPage.mockImplementation(async (url: string) => listingFor(url));
    advance(HOUR);
    expect(await checkNewChapters(deps)).toEqual({ checked: 2, reported: 2 });
  });

  it("does not start a run while offline", async () => {
    const { deps, setOnline } = await setup([watched("solo-leveling")]);
    setOnline(false);
    expect(await checkNewChapters(deps)).toEqual({ checked: 0, reported: 0 });
    expect(deps.api.getSeriesWatch).not.toHaveBeenCalled();
  });

  it("keeps results the tracker did not take and sends them next time, without fetching the page again", async () => {
    const solo = watched("solo-leveling");
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });
    deps.api.postLatestChapters.mockResolvedValueOnce({ ok: false, kind: "retry", message: "offline" });

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 0 });
    advance(HOUR);
    await checkNewChapters(deps);

    expect(deps.fetchPage).toHaveBeenCalledTimes(1);
    expect(deps.api.postLatestChapters).toHaveBeenCalledTimes(2);
    expect(deps.api.postLatestChapters).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), [
      { sourceKey: "site:asura", externalKey: "solo-leveling", latestChapter: 203 },
    ]);
  });

  it("checks a series again right away when its page moved to the current domain, despite a back-off", async () => {
    const old = watched("solo-leveling");
    const moved = watched("solo-leveling", 200, "asurascans.com");
    const { deps, advance } = await setup([old], {
      [old.seriesUrl]: () => html("", { status: 404 }),
      [moved.seriesUrl]: () => html(listing("solo-leveling", 205)),
    });

    await checkNewChapters(deps);
    deps.api.getSeriesWatch.mockResolvedValue({ ok: true, value: { series: [moved] } });
    advance(7 * HOUR);
    await checkNewChapters(deps);

    expect(fetched(deps)).toEqual([old.seriesUrl, moved.seriesUrl]);
  });

  it("never fetches a page without host permission or on a site that is not enabled", async () => {
    const elsewhere = watched("solo-leveling", 200, "other.example");
    const { deps: withoutPermission } = await setup([watched("solo-leveling")], {}, { granted: false });
    const { deps: notEnabled } = await setup([elsewhere]);

    await checkNewChapters(withoutPermission);
    await checkNewChapters(notEnabled);

    expect(withoutPermission.permissions.contains).toHaveBeenCalledWith({ origins: ["https://asuracomic.net/*"] });
    expect(fetched(withoutPermission)).toEqual([]);
    expect(fetched(notEnabled)).toEqual([]);
  });

  it("asks the tracker for the list at most every 6 hours and keeps using the last one when it is down", async () => {
    const solo = watched("solo-leveling");
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });
    await checkNewChapters(deps);
    advance(HOUR);
    await checkNewChapters(deps);
    expect(deps.api.getSeriesWatch).toHaveBeenCalledTimes(1);

    deps.api.getSeriesWatch.mockResolvedValue({ ok: false, kind: "retry", message: "down" });
    advance(DAY);
    await checkNewChapters(deps);
    expect(deps.api.getSeriesWatch).toHaveBeenCalledTimes(2);
    expect(deps.fetchPage).toHaveBeenCalledTimes(2);
  });

  it("forgets the schedule of series that left the list", async () => {
    const solo = watched("solo-leveling");
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });
    await checkNewChapters(deps);

    deps.api.getSeriesWatch.mockResolvedValue({ ok: true, value: { series: [] } });
    advance(7 * HOUR);
    await checkNewChapters(deps);

    expect(await deps.store.read("newChapterSchedule", z.record(z.string(), z.unknown()), {})).toEqual({});
  });

  it("does nothing when switched off or not paired", async () => {
    const { deps } = await setup([watched("solo-leveling")]);
    expect(await loadNewChapterChecks(deps.store)).toBe(true);

    await saveNewChapterChecks(deps.store, false);
    expect(await checkNewChapters(deps)).toEqual({ checked: 0, reported: 0 });
    await saveNewChapterChecks(deps.store, true);
    await saveSettings(deps.store, { ...paired, deviceToken: null });
    expect(await checkNewChapters(deps)).toEqual({ checked: 0, reported: 0 });

    expect(deps.api.getSeriesWatch).not.toHaveBeenCalled();
  });

  it("drops the credentials when the tracker revoked this device", async () => {
    const { deps } = await setup([]);
    deps.api.getSeriesWatch.mockResolvedValue({ ok: false, kind: "unauthorized", message: "Token nicht mehr gültig" });

    await checkNewChapters(deps);

    expect(deps.onUnauthorized).toHaveBeenCalled();
  });

  it("survives a corrupted schedule and pending list in storage", async () => {
    const solo = watched("solo-leveling");
    const { deps } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });
    await deps.store.write("newChapterSchedule", { "site:asura|solo-leveling": "tomorrow" });
    await deps.store.write("newChapterPending", [{ sourceKey: "<script>", latestChapter: "many" }]);

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 1 });
  });
});
