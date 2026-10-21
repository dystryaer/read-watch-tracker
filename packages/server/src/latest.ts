import { onCurrentDomain } from "@rwt/core";
import { type Db, sourceDomains, sources, workLinks, works } from "@rwt/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";

const MAX_WATCHED = 500;

export interface WatchedSeries {
  sourceKey: string;
  externalKey: string;
  /** On the source's current domain. */
  seriesUrl: string;
  chapter: number;
}

export interface LatestChapter {
  sourceKey: string;
  externalKey: string;
  latestChapter: number;
}

/**
 * Series whose page the extension may check for new chapters (SPEC §7.11): works being read with a
 * known chapter, linked to an enabled website with a known series page.
 */
export async function seriesToWatch(db: Db): Promise<WatchedSeries[]> {
  const rows = await db
    .select({
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
    .orderBy(desc(works.lastProgressAt))
    .limit(MAX_WATCHED);

  return rows.flatMap(({ sourceKey, externalKey, seriesUrl, chapter, currentDomain }) => {
    const url = onCurrentDomain(seriesUrl, currentDomain);
    return url && chapter !== null ? [{ sourceKey, externalKey, seriesUrl: url, chapter }] : [];
  });
}

/** Stores what the series pages show now at the linked works; returns how many works it updated. */
export async function recordLatestChapters(db: Db, items: readonly LatestChapter[], now = new Date()): Promise<number> {
  let updated = 0;
  for (const item of items) {
    const [link] = await db
      .select({ workId: workLinks.workId })
      .from(workLinks)
      .innerJoin(sources, eq(sources.id, workLinks.sourceId))
      .where(and(eq(sources.key, item.sourceKey), eq(workLinks.externalKey, item.externalKey)));
    if (!link) continue;
    await db.update(works).set({ latestChapter: item.latestChapter, latestChapterAt: now }).where(eq(works.id, link.workId));
    updated++;
  }
  return updated;
}
