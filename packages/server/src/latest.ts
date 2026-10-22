import { type LatestChaptersRequest, onCurrentDomain, type SeriesWatchResponse } from "@rwt/core";
import { type Db, sourceDomains, sources, workLinks, works } from "@rwt/db";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

const MAX_WATCHED = 500;
/**
 * Finished and dropped works are checked too: the updates page shows them once new chapters
 * appear (SPEC §4.9). Named, so a status added later is not watched by accident.
 */
const WATCHED_STATUSES = ["reading", "completed", "dropped"] as const;

type WatchedSeries = SeriesWatchResponse["series"][number];
type LatestChapter = LatestChaptersRequest["items"][number];

/**
 * Series whose page the extension may check for new chapters (SPEC §7.11): works with a known
 * chapter, linked to an enabled website with a known series page. One page per work – the site I
 * read it on last, else the link confirmed last – so two sites cannot overwrite each other's
 * newest chapter. Works being read come first, then finished and dropped ones, each recently read
 * first and never-active last: the cap of 500 cuts the least likely reads.
 */
export async function seriesToWatch(db: Db): Promise<WatchedSeries[]> {
  const rows = await db
    .selectDistinctOn([works.id], {
      workId: works.id,
      reading: sql<boolean>`${works.status} = 'reading'`,
      lastProgressAt: works.lastProgressAt,
      sourceKey: sources.key,
      externalKey: workLinks.externalKey,
      seriesUrl: workLinks.seriesUrl,
      chapter: works.chapter,
      currentDomain: sourceDomains.domain,
    })
    .from(workLinks)
    .innerJoin(works, eq(works.id, workLinks.workId))
    .innerJoin(sources, eq(sources.id, workLinks.sourceId))
    .leftJoin(sourceDomains, and(eq(sourceDomains.sourceId, sources.id), eq(sourceDomains.isCurrent, true)))
    .where(
      and(
        inArray(works.status, WATCHED_STATUSES),
        isNotNull(works.chapter),
        isNotNull(workLinks.seriesUrl),
        eq(sources.kind, "website"),
        eq(sources.trackingEnabled, true),
      ),
    )
    .orderBy(works.id, sql`${workLinks.sourceId} = ${works.lastSourceId} desc nulls last`, desc(workLinks.confirmedAt), workLinks.id);

  const recentFirst = (time: Date | null) => time?.getTime() ?? -Infinity;
  rows.sort(
    (a, b) =>
      Number(b.reading) - Number(a.reading) ||
      recentFirst(b.lastProgressAt) - recentFirst(a.lastProgressAt) ||
      a.workId.localeCompare(b.workId),
  );
  return rows.slice(0, MAX_WATCHED).flatMap(({ sourceKey, externalKey, seriesUrl, chapter, currentDomain }) => {
    const url = onCurrentDomain(seriesUrl, currentDomain);
    return url && chapter !== null ? [{ sourceKey, externalKey, seriesUrl: url, chapter }] : [];
  });
}

/**
 * Stores what the series pages show now at the linked works; returns how many works it updated.
 * Only works that series-watch could have listed are written: a stolen extension token cannot put
 * badges on works without a known chapter or on app books.
 */
export async function recordLatestChapters(db: Db, items: readonly LatestChapter[], now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    let updated = 0;
    for (const item of items) {
      const [link] = await tx
        .select({ workId: workLinks.workId })
        .from(workLinks)
        .innerJoin(sources, eq(sources.id, workLinks.sourceId))
        .innerJoin(works, eq(works.id, workLinks.workId))
        .where(
          and(
            eq(sources.key, item.sourceKey),
            eq(workLinks.externalKey, item.externalKey),
            eq(sources.kind, "website"),
            eq(sources.trackingEnabled, true),
            isNotNull(workLinks.seriesUrl),
            inArray(works.status, WATCHED_STATUSES),
            isNotNull(works.chapter),
          ),
        );
      if (!link) continue;
      await tx.update(works).set({ latestChapter: item.latestChapter, latestChapterAt: now }).where(eq(works.id, link.workId));
      updated++;
    }
    return updated;
  });
}
