import { detectChapterFromUrl, type DeviceConfig, MAX_TEXT_LENGTH } from "@rwt/core";
import { deterministicEventId } from "./event-id";
import type { Detection } from "./messages";
import { findSiteForUrl } from "./sites";

export const MAX_BACKFILL_ENTRIES = 2000;

export interface HistoryItem {
  url?: string;
  title?: string;
  lastVisitTime?: number;
}

export interface BackfillEntry {
  sourceKey: string;
  url: string;
  visitedAt: number;
  detection: Detection;
}

/**
 * The highest chapter per series found in the browser history (SPEC §7.9), limited to enabled
 * sites (old domains included). Only URLs and titles are evaluated, no page is opened.
 */
export function collectBackfill(items: HistoryItem[], config: DeviceConfig): BackfillEntry[] {
  const best = new Map<string, BackfillEntry>();
  for (const item of items) {
    if (!item.url) continue;
    const site = findSiteForUrl(config, item.url);
    if (!site) continue;
    const detection = detectChapterFromUrl(item.url, item.title ?? "", site);
    if (!detection) continue;

    const key = `${site.sourceKey}\n${detection.seriesKey}`;
    const existing = best.get(key);
    const visitedAt = item.lastVisitTime ?? 0;
    if (existing && existing.detection.chapter >= detection.chapter) continue;
    if (!existing && best.size >= MAX_BACKFILL_ENTRIES) continue;
    best.set(key, {
      sourceKey: site.sourceKey,
      url: item.url,
      visitedAt,
      detection: {
        chapter: detection.chapter,
        seriesKey: detection.seriesKey,
        title: detection.title ? detection.title.slice(0, MAX_TEXT_LENGTH) : null,
        seriesUrl: detection.seriesUrl,
      },
    });
  }
  return [...best.values()];
}

/** Running the backfill twice sends the same ids, so the server treats the second run as duplicates. */
export function backfillEventId(sourceKey: string, seriesKey: string, chapter: number): Promise<string> {
  return deterministicEventId(["backfill", sourceKey, seriesKey, chapter]);
}
