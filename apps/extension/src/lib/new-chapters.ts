import { latestChapterIn, looksLikeChallenge, MAX_SERIES_PAGE_LENGTH, normalizeDomain, parseHttpUrl, SeriesWatchResponse, type SiteRule } from "@rwt/core";
import { z } from "zod";
import type { ApiResult } from "./api-client";
import { loadCachedConfig, loadSettings } from "./settings";
import type { Store } from "./storage";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LIST_MAX_AGE_MS = 6 * HOUR;
const CHECK_EVERY_MS = DAY;
const BACK_OFF_MS = 7 * DAY;
const RETRY_DELIVERY_MS = HOUR;
const MAX_PER_RUN = 10;
const PAUSE_MS = 3000;

const ENABLED_KEY = "checkNewChapters";
const LIST_KEY = "newChapterWatch";
const SCHEDULE_KEY = "newChapterSchedule";

const CachedWatch = z.object({ series: SeriesWatchResponse.shape.series, fetchedAt: z.number() });
/** When each series may be checked next, by "sourceKey|externalKey". */
const Schedule = z.record(z.string().max(500), z.number());

type Series = SeriesWatchResponse["series"][number];
export interface LatestChapterItem {
  sourceKey: string;
  externalKey: string;
  latestChapter: number;
}

export interface NewChapterDeps {
  store: Store;
  api: {
    getSeriesWatch(apiUrl: string, token: string): Promise<ApiResult<SeriesWatchResponse>>;
    postLatestChapters(apiUrl: string, token: string, items: LatestChapterItem[]): Promise<ApiResult<{ updated: number }>>;
  };
  /** A plain GET of a series page: no cookies, no changed headers (SPEC §7.11). */
  fetchPage(url: string): Promise<Response>;
  permissions: { contains(request: { origins: string[] }): Promise<boolean> };
  now(): number;
  sleep(ms: number): Promise<void>;
  onUnauthorized(): void;
}

/** The option "Neue Kapitel prüfen"; on unless switched off. */
export const loadNewChapterChecks = (store: Store) => store.read(ENABLED_KEY, z.boolean(), true);
export const saveNewChapterChecks = (store: Store, enabled: boolean) => store.write(ENABLED_KEY, enabled);

const keyOf = (series: { sourceKey: string; externalKey: string }) => `${series.sourceKey}|${series.externalKey}`;

/** What one check found: the newest chapter (null: the page lists none), or whether to back off. */
type CheckResult = { latest: number | null; backOff: boolean };
const SKIPPED: CheckResult = { latest: null, backOff: false };
const FAILED: CheckResult = { latest: null, backOff: true };

/**
 * One run of the new-chapter check (SPEC §7.11), started hourly by an alarm while the browser
 * runs: up to 10 series that are due, each at most once a day, 3 s apart, results sent together.
 */
export async function checkNewChapters(deps: NewChapterDeps): Promise<{ checked: number; reported: number }> {
  const { apiUrl, deviceToken } = await loadSettings(deps.store);
  if (!apiUrl || !deviceToken || !(await loadNewChapterChecks(deps.store))) return { checked: 0, reported: 0 };

  const list = await watchList(deps, apiUrl, deviceToken);
  if (!list) return { checked: 0, reported: 0 };
  const sites = (await loadCachedConfig(deps.store))?.config.sites ?? [];
  const schedule = await deps.store.read(SCHEDULE_KEY, Schedule, {});
  const now = deps.now();
  const due = list.filter((series) => (schedule[keyOf(series)] ?? 0) <= now).slice(0, MAX_PER_RUN);

  const found: LatestChapterItem[] = [];
  for (const [index, series] of due.entries()) {
    if (index > 0) await deps.sleep(PAUSE_MS);
    const result = await checkSeries(deps, series, sites);
    schedule[keyOf(series)] = now + (result.backOff ? BACK_OFF_MS : CHECK_EVERY_MS);
    if (result.latest !== null) found.push({ sourceKey: series.sourceKey, externalKey: series.externalKey, latestChapter: result.latest });
  }

  let reported = 0;
  if (found.length > 0) {
    const sent = await deps.api.postLatestChapters(apiUrl, deviceToken, found);
    if (sent.ok) reported = found.length;
    else {
      if (sent.kind === "unauthorized") deps.onUnauthorized();
      for (const item of found) schedule[keyOf(item)] = now + RETRY_DELIVERY_MS;
    }
  }

  // Only series still on the list keep an entry, so the schedule cannot grow without bound.
  const watched = new Set(list.map(keyOf));
  await deps.store.write(SCHEDULE_KEY, Object.fromEntries(Object.entries(schedule).filter(([key]) => watched.has(key))));
  return { checked: due.length, reported };
}

async function watchList(deps: NewChapterDeps, apiUrl: string, token: string): Promise<Series[] | null> {
  const cached = await deps.store.read(LIST_KEY, CachedWatch.nullable(), null);
  const age = cached ? deps.now() - cached.fetchedAt : Infinity;
  if (cached && age >= 0 && age < LIST_MAX_AGE_MS) return cached.series;

  const result = await deps.api.getSeriesWatch(apiUrl, token);
  if (result.ok) {
    await deps.store.write(LIST_KEY, { series: result.value.series, fetchedAt: deps.now() });
    return result.value.series;
  }
  if (result.kind === "unauthorized") {
    deps.onUnauthorized();
    return null;
  }
  return cached?.series ?? null;
}

async function checkSeries(deps: NewChapterDeps, series: Series, sites: readonly SiteRule[]): Promise<CheckResult> {
  const url = parseHttpUrl(series.seriesUrl);
  if (!url) return SKIPPED;
  const host = normalizeDomain(url.hostname);
  // Only sites I enabled, and only with the host permission the extension already holds.
  const rule = sites.find((site) => site.sourceKey === series.sourceKey && site.domains.includes(host));
  if (!rule || !(await deps.permissions.contains({ origins: [`${url.origin}/*`] }))) return SKIPPED;

  let response: Response;
  try {
    response = await deps.fetchPage(url.href);
  } catch {
    return FAILED;
  }
  const finalUrl = parseHttpUrl(response.url) ?? url;
  if (response.status !== 200 || (response.redirected && normalizeDomain(finalUrl.hostname) !== host)) return FAILED;
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return FAILED;
  if (Number(response.headers.get("content-length") ?? 0) > MAX_SERIES_PAGE_LENGTH) return FAILED;

  const html = await readText(response, MAX_SERIES_PAGE_LENGTH);
  // A bot check is skipped, never worked around (SPEC §16).
  if (html === null || looksLikeChallenge(html)) return FAILED;
  return { latest: latestChapterIn(html, finalUrl.href, series.externalKey, rule), backOff: false };
}

/** The body as text, or null beyond `maxBytes`: counted while streaming, whatever the headers claim. */
async function readText(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
