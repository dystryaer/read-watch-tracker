import { type Db, pendingMatches, sourceDomains, sources, workCovers, workLinks, works } from "@rwt/db";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";

type WorkColumns = Pick<
  typeof works.$inferSelect,
  "id" | "type" | "title" | "status" | "chapter" | "season" | "episode" | "percent" | "lastUrl" | "lastProgressAt" | "latestChapter"
>;

export interface OverviewRow extends WorkColumns {
  source: {
    key: string;
    name: string;
    kind: (typeof sources.$inferSelect)["kind"];
    currentDomain: string | null;
    nextUrlTemplate: string | null;
  } | null;
  /** Series page on the last used source, if known. */
  seriesUrl: string | null;
  /** Titles under which sources know the work; used by the search. */
  aliases: string[];
  /** When the work's picture last changed (part of its URL, so browsers may cache it); null: tile. */
  coverVersion: number | null;
}

/** Everything the core screen needs (SPEC §4), in four queries regardless of list size. */
export async function listOverview(db: Db): Promise<OverviewRow[]> {
  const rows = await db
    .select({
      work: {
        id: works.id,
        type: works.type,
        title: works.title,
        status: works.status,
        chapter: works.chapter,
        season: works.season,
        episode: works.episode,
        percent: works.percent,
        lastUrl: works.lastUrl,
        lastProgressAt: works.lastProgressAt,
        latestChapter: works.latestChapter,
        lastSourceId: works.lastSourceId,
      },
      source: {
        key: sources.key,
        name: sources.name,
        kind: sources.kind,
        nextUrlTemplate: sources.ruleNextUrlTemplate,
      },
      currentDomain: sourceDomains.domain,
    })
    .from(works)
    .leftJoin(sources, eq(sources.id, works.lastSourceId))
    .leftJoin(sourceDomains, and(eq(sourceDomains.sourceId, sources.id), eq(sourceDomains.isCurrent, true)));

  const links = await db
    .select({
      workId: workLinks.workId,
      sourceId: workLinks.sourceId,
      externalTitle: workLinks.externalTitle,
      seriesUrl: workLinks.seriesUrl,
    })
    .from(workLinks)
    // Newest first: after a key change (§5.3 step 4) the new link carries the current URL scheme.
    .orderBy(desc(workLinks.confirmedAt));
  // Only the versions: the pictures themselves come one by one from /works/[id]/cover.
  const covers = await db
    .select({ workId: workCovers.workId, updatedAt: workCovers.updatedAt })
    .from(workCovers)
    .where(inArray(workCovers.kind, ["site", "upload"]));
  const coverVersions = new Map(covers.map((cover) => [cover.workId, cover.updatedAt.getTime()]));
  const linksByWork = new Map<string, typeof links>();
  for (const link of links) {
    const list = linksByWork.get(link.workId);
    if (list) list.push(link);
    else linksByWork.set(link.workId, [link]);
  }

  return rows.map(({ work, source, currentDomain }) => {
    const workLinksOf = linksByWork.get(work.id) ?? [];
    const { lastSourceId, ...columns } = work;
    return {
      ...columns,
      source: source ? { ...source, currentDomain } : null,
      seriesUrl: workLinksOf.find((link) => link.sourceId === lastSourceId && link.seriesUrl)?.seriesUrl ?? null,
      aliases: [...new Set(workLinksOf.map((link) => link.externalTitle))],
      coverVersion: coverVersions.get(work.id) ?? null,
    };
  });
}

export async function countOpenPending(db: Db): Promise<number> {
  const [row] = await db.select({ open: count() }).from(pendingMatches).where(isNull(pendingMatches.resolvedAt));
  return row?.open ?? 0;
}

/**
 * For the WebNovel reminder on the core screen (SPEC §9.1): when the WebNovel library last came in
 * through the extension, and whether any work being read is linked to WebNovel at all.
 */
export async function webnovelSyncStatus(db: Db): Promise<{ lastSync: Date | null; readsOnWebnovel: boolean }> {
  const [source] = await db.select({ id: sources.id, lastSync: sources.lastLibrarySyncAt }).from(sources).where(eq(sources.key, "webnovel"));
  if (!source) return { lastSync: null, readsOnWebnovel: false };
  const [reading] = await db
    .select({ id: works.id })
    .from(works)
    .innerJoin(workLinks, eq(workLinks.workId, works.id))
    .where(and(eq(workLinks.sourceId, source.id), eq(works.status, "reading")))
    .limit(1);
  return { lastSync: source.lastSync, readsOnWebnovel: reading !== undefined };
}
