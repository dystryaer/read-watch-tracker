import { type LatestChaptersRequest, onCurrentDomain, type SeriesWatchResponse } from "@rwt/core";
import { type Db, sourceDomains, sources, workLinks, works } from "@rwt/db";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

const MAX_WATCHED = 500;

type WatchedSeries = SeriesWatchResponse["series"][number];
type LatestChapter = LatestChaptersRequest["items"][number];

/**
 * Series whose page the extension may check for new chapters (SPEC §7.11): works being read with a
 * known chapter, linked to an enabled website with a known series page. One page per work – the
 * site I read it on last, else the link confirmed last – so two sites cannot overwrite each other's
 * newest chapter. Recently read works come first, never-active ones last.
 */
export async function seriesToWatch(db: Db): Promise<WatchedSeries[]> {
  const rows = await db
    .selectDistinctOn([works.id], {
      workId: works.id,
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
        eq(works.status, "reading"),
        isNotNull(works.chapter),
        isNotNull(workLinks.seriesUrl),
        eq(sources.kind, "website"),
        eq(sources.trackingEnabled, true),
      ),
    )
    .orderBy(works.id, sql`${workLinks.sourceId} = ${works.lastSourceId} desc nulls last`, desc(workLinks.confirmedAt), workLinks.id);

  const recentFirst = (time: Date | null) => time?.getTime() ?? -Infinity;
  rows.sort((a, b) => recentFirst(b.lastProgressAt) - recentFirst(a.lastProgressAt) || a.workId.localeCompare(b.workId));
  return rows.slice(0, MAX_WATCHED).flatMap(({ sourceKey, externalKey, seriesUrl, chapter, currentDomain }) => {
    const url = onCurrentDomain(seriesUrl, currentDomain);
    return url && chapter !== null ? [{ sourceKey, externalKey, seriesUrl: url, chapter }] : [];
  });
}

/** Stores what the series pages show now at the linked works; returns how many works it updated. */
export async function recordLatestChapters(db: Db, items: readonly LatestChapter[], now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    let updated = 0;
    for (const item of items) {
      const [link] = await tx
        .select({ workId: workLinks.workId })
        .from(workLinks)
        .innerJoin(sources, eq(sources.id, workLinks.sourceId))
        .where(and(eq(sources.key, item.sourceKey), eq(workLinks.externalKey, item.externalKey)));
      if (!link) continue;
      await tx.update(works).set({ latestChapter: item.latestChapter, latestChapterAt: now }).where(eq(works.id, link.workId));
      updated++;
    }
    return updated;
  });
}
