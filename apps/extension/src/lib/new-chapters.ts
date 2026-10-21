import {
  LatestChaptersRequest,
  latestChapterIn,
  looksLikeChallenge,
  MAX_SERIES_PAGE_LENGTH,
  normalizeDomain,
  parseHttpUrl,
  SeriesWatchResponse,
  type SiteRule,
} from "@rwt/core";
import { z } from "zod";
import type { ApiResult } from "./api-client";
import { loadCachedConfig, loadSettings } from "./settings";
import type { Store } from "./storage";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LIST_MAX_AGE_MS = 6 * HOUR;
const CHECK_EVERY_MS = DAY;
const BACK_OFF_MS = 7 * DAY;
const MAX_PER_RUN = 10;
const MAX_PENDING = 100;
const PAUSE_MS = 3000;

const ENABLED_KEY = "checkNewChapters";
const LIST_KEY = "newChapterWatch";
const SCHEDULE_KEY = "newChapterSchedule";
const PENDING_KEY = "newChapterPending";

type Series = SeriesWatchResponse["series"][number];
export type LatestChapterItem = LatestChaptersRequest["items"][number];

const CachedWatch = z.object({ series: SeriesWatchResponse.shape.series, fetchedAt: z.number() });
/** When each series may be checked next, by "sourceKey|externalKey" – for the page URL it was checked at. */
const Schedule = z.record(z.string().max(500), z.object({ url: z.string().max(2048), next: z.number() }));
type Schedule = z.infer<typeof Schedule>;
/** Results the tracker has not taken yet; sent again without fetching the pages again. */
const Pending = LatestChaptersRequest.shape.items.unwrap().array().max(MAX_PENDING);

export interface NewChapterDeps {
  store: Store;
  api: {
    getSeriesWatch(apiUrl: string, token: string): Promise<ApiResult<SeriesWatchResponse>>;
    postLatestChapters(apiUrl: string, token: string, items: LatestChapterItem[]): Promise<ApiResult<{ updated: number }>>;
  };
  /** A plain GET of a series page: no cookies, no changed headers, with a timeout (SPEC §7.11). */
  fetchPage(url: string): Promise<Response>;
  permissions: { contains(request: { origins: string[] }): Promise<boolean> };
  isOnline(): boolean;
  now(): number;
  sleep(ms: number): Promise<void>;
  onUnauthorized(): void;
}

/** The option "Neue Kapitel prüfen"; on unless switched off. */
export const loadNewChapterChecks = (store: Store) => store.read(ENABLED_KEY, z.boolean(), true);
export const saveNewChapterChecks = (store: Store, enabled: boolean) => store.write(ENABLED_KEY, enabled);

const keyOf = (series: { sourceKey: string; externalKey: string }) => `${series.sourceKey}|${series.externalKey}`;

/** What one check found, and when to look again; "offline" stops the run without any penalty. */
type CheckResult = { latest: number | null; nextIn: number } | "offline";

/**
 * One run of the new-chapter check (SPEC §7.11), started hourly by an alarm while the browser
 * runs: up to 10 due series, never-checked ones first, each at most once a day, 3 s apart. A
 * series is claimed before its page is fetched, so a run that dies midway does not repeat it.
 */
export async function checkNewChapters(deps: NewChapterDeps): Promise<{ checked: number; reported: number }> {
  const { apiUrl, deviceToken } = await loadSettings(deps.store);
  if (!apiUrl || !deviceToken || !deps.isOnline() || !(await loadNewChapterChecks(deps.store))) return { checked: 0, reported: 0 };

  const list = await watchList(deps, apiUrl, deviceToken);
  if (!list) return { checked: 0, reported: 0 };
  const sites = (await loadCachedConfig(deps.store))?.config.sites ?? [];
  const schedule = await deps.store.read(SCHEDULE_KEY, Schedule, {});
  const now = deps.now();
  // An entry for another URL (after a domain move) does not hold the series back.
  const entryOf = (series: Series) => {
    const entry = schedule[keyOf(series)];
    return entry?.url === series.seriesUrl ? entry : undefined;
  };
  const due = list
    .filter((series) => (entryOf(series)?.next ?? 0) <= now)
    .sort((a, b) => (entryOf(a)?.next ?? 0) - (entryOf(b)?.next ?? 0))
    .slice(0, MAX_PER_RUN);

  const found: LatestChapterItem[] = [];
  let checked = 0;
  for (const series of due) {
    if (checked > 0) await deps.sleep(PAUSE_MS);
    const key = keyOf(series);
    const before = schedule[key];
    schedule[key] = { url: series.seriesUrl, next: now + CHECK_EVERY_MS };
    await deps.store.write(SCHEDULE_KEY, schedule);

    checked++;
    const result = await checkSeries(deps, series, sites);
    if (result === "offline") {
      // Due again as before: being offline is no reason to wait.
      schedule[key] = before ?? { url: series.seriesUrl, next: 0 };
      break;
    }
    schedule[key] = { url: series.seriesUrl, next: now + result.nextIn };
    // A page listing less than I have read shows only part of its chapters (e.g. the first 50).
    if (result.latest !== null && result.latest >= Math.floor(series.chapter)) {
      found.push({ sourceKey: series.sourceKey, externalKey: series.externalKey, latestChapter: result.latest });
    }
  }

  // Only series still on the list keep an entry, so the schedule cannot grow without bound.
  const watched = new Set(list.map(keyOf));
  await deps.store.write(SCHEDULE_KEY, Object.fromEntries(Object.entries(schedule).filter(([key]) => watched.has(key))));
  return { checked, reported: await deliver(deps, apiUrl, deviceToken, found) };
}

/** Sends the new results together with any the tracker did not take before; keeps them on failure. */
async function deliver(deps: NewChapterDeps, apiUrl: string, token: string, found: LatestChapterItem[]): Promise<number> {
  const fresh = new Set(found.map(keyOf));
  const earlier = (await deps.store.read(PENDING_KEY, Pending, [])).filter((item) => !fresh.has(keyOf(item)));
  const items = [...earlier, ...found].slice(-MAX_PENDING);
  if (items.length === 0) return 0;

  const sent = await deps.api.postLatestChapters(apiUrl, token, items);
  if (sent.ok) {
    await deps.store.write(PENDING_KEY, []);
    return items.length;
  }
  if (sent.kind === "unauthorized") deps.onUnauthorized();
  await deps.store.write(PENDING_KEY, items);
  return 0;
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

const AGAIN_TOMORROW: CheckResult = { latest: null, nextIn: CHECK_EVERY_MS };
const BACK_OFF: CheckResult = { latest: null, nextIn: BACK_OFF_MS };

async function checkSeries(deps: NewChapterDeps, series: Series, sites: readonly SiteRule[]): Promise<CheckResult> {
  const url = parseHttpUrl(series.seriesUrl);
  if (!url) return AGAIN_TOMORROW;
  const host = normalizeDomain(url.hostname);
  // Only sites I enabled, and only with the host permission the extension already holds.
  const rule = sites.find((site) => site.sourceKey === series.sourceKey && site.domains.includes(host));
  if (!rule || !(await deps.permissions.contains({ origins: [`${url.origin}/*`] }))) return AGAIN_TOMORROW;

  let response: Response;
  try {
    response = await deps.fetchPage(url.href);
  } catch {
    // Offline (laptop just woke up) is no fault of the site; a site that does not answer is tried tomorrow.
    return deps.isOnline() ? AGAIN_TOMORROW : "offline";
  }
  const finalUrl = parseHttpUrl(response.url) ?? url;
  if (response.status !== 200 || (response.redirected && normalizeDomain(finalUrl.hostname) !== host)) return BACK_OFF;
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return BACK_OFF;
  if (Number(response.headers.get("content-length") ?? 0) > MAX_SERIES_PAGE_LENGTH) return BACK_OFF;

  const html = await readText(response, MAX_SERIES_PAGE_LENGTH).catch(() => null);
  // A bot check is skipped, never worked around (SPEC §16).
  if (html === null || looksLikeChallenge(html)) return BACK_OFF;
  return { latest: latestChapterIn(html, finalUrl.href, series.externalKey, rule), nextIn: CHECK_EVERY_MS };
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
