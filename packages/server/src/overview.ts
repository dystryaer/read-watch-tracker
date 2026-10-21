import { type Db, pendingMatches, sourceDomains, sources, workLinks, works } from "@rwt/db";
import { and, count, eq, isNull } from "drizzle-orm";

type WorkColumns = Pick<
  typeof works.$inferSelect,
  "id" | "type" | "title" | "status" | "chapter" | "season" | "episode" | "percent" | "lastUrl" | "lastProgressAt"
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
}

/** Everything the core screen needs (SPEC §4), in three queries regardless of list size. */
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
    .from(workLinks);
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
    };
  });
}

export async function countOpenPending(db: Db): Promise<number> {
  const [row] = await db.select({ open: count() }).from(pendingMatches).where(isNull(pendingMatches.resolvedAt));
  return row?.open ?? 0;
}
