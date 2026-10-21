import type { DeviceConfig, SeriesWatchResponse } from "@rwt/core";
import { describe, expect, it, vi } from "vitest";
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
  sites: [{ sourceKey: "site:asura", domains: ["asuracomic.net"] }],
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

function html(body: string, init: { status?: number; type?: string; length?: number; redirectedTo?: string } = {}): Response {
  const headers: Record<string, string> = { "content-type": init.type ?? "text/html; charset=utf-8" };
  if (init.length !== undefined) headers["content-length"] = String(init.length);
  const response = new Response(body, { status: init.status ?? 200, headers });
  if (init.redirectedTo) {
    Object.defineProperty(response, "redirected", { value: true });
    Object.defineProperty(response, "url", { value: init.redirectedTo });
  }
  return response;
}

async function setup(series: Series[], pages: Record<string, () => Response> = {}, options: { granted?: boolean } = {}) {
  const store = createStore(fakeStorage());
  await saveSettings(store, paired);
  await saveCachedConfig(store, { config, etag: null, fetchedAt: 0 });
  let now = 1_000_000_000;
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
    now: () => now,
    sleep: vi.fn<(ms: number) => Promise<void>>(async () => {}),
    onUnauthorized: vi.fn(),
  };
  return { deps, advance: (ms: number) => (now += ms) };
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
    const many = Array.from({ length: 12 }, (_, index) => watched(`series-${index}`));
    const { deps } = await setup(many);

    await checkNewChapters(deps);

    expect(deps.fetchPage).toHaveBeenCalledTimes(10);
    expect(deps.sleep).toHaveBeenCalledTimes(9);
    expect(deps.sleep).toHaveBeenCalledWith(3000);
  });

  it.each([
    ["a bot check", () => html(`<html><head><title>Just a moment...</title></head></html>`)],
    ["a redirect to another site", () => html(listing("solo-leveling", 203), { redirectedTo: "https://parked.example/" })],
    ["an error status", () => html("", { status: 503 })],
    ["something else than HTML", () => html("{}", { type: "application/json" })],
    ["an oversized page", () => html(listing("solo-leveling", 203), { length: 3 * 1024 * 1024 })],
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

  it("asks the tracker for the list at most every 6 hours", async () => {
    const { deps, advance } = await setup([]);
    await checkNewChapters(deps);
    advance(HOUR);
    await checkNewChapters(deps);
    expect(deps.api.getSeriesWatch).toHaveBeenCalledTimes(1);

    advance(6 * HOUR);
    await checkNewChapters(deps);
    expect(deps.api.getSeriesWatch).toHaveBeenCalledTimes(2);
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

  it("checks again within the hour when the results could not be delivered", async () => {
    const solo = watched("solo-leveling");
    const { deps, advance } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });
    deps.api.postLatestChapters.mockResolvedValueOnce({ ok: false, kind: "retry", message: "offline" });

    await checkNewChapters(deps);
    advance(HOUR + 1);
    await checkNewChapters(deps);

    expect(deps.fetchPage).toHaveBeenCalledTimes(2);
    expect(deps.api.postLatestChapters).toHaveBeenCalledTimes(2);
  });

  it("survives a corrupted schedule in storage", async () => {
    const solo = watched("solo-leveling");
    const { deps } = await setup([solo], { [solo.seriesUrl]: () => html(listing("solo-leveling", 203)) });
    await deps.store.write("newChapterSchedule", { "site:asura|solo-leveling": "tomorrow" });

    expect(await checkNewChapters(deps)).toEqual({ checked: 1, reported: 1 });
  });
});
