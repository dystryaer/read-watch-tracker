import { normalizeTitle, type Position } from "@rwt/core";
import { type Db, events, type MatchCandidate, type pendingMatches, workLinks, works } from "@rwt/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { mediaTypesFor, positionFromColumns } from "./work-progress";

const MAX_CANDIDATES = 3;

/** Up to three works with trigram similarity ≥ 0.3 (pg_trgm's `%` threshold) whose type fits. */
export async function findCandidates(db: Db, titleKey: string, unit: Position["unit"]): Promise<MatchCandidate[]> {
  if (titleKey === "") return [];
  const typeFilter = unit === "none" ? undefined : inArray(works.type, mediaTypesFor(unit));

  const workScore = sql<number>`similarity(${works.titleNormalized}, ${titleKey})`.mapWith(Number);
  const byTitle = await db
    .select({ workId: works.id, score: workScore })
    .from(works)
    .where(and(sql`${works.titleNormalized} % ${titleKey}`, typeFilter))
    .orderBy(desc(workScore))
    .limit(10);

  const linkScore = sql<number>`similarity(${workLinks.externalTitleNormalized}, ${titleKey})`.mapWith(Number);
  const byAlias = await db
    .select({ workId: workLinks.workId, score: linkScore })
    .from(workLinks)
    .innerJoin(works, eq(works.id, workLinks.workId))
    .where(and(sql`${workLinks.externalTitleNormalized} % ${titleKey}`, typeFilter))
    .orderBy(desc(linkScore))
    .limit(10);

  const best = new Map<string, number>();
  for (const { workId, score } of [...byTitle, ...byAlias]) {
    best.set(workId, Math.max(best.get(workId) ?? 0, score));
  }
  return [...best]
    .map(([workId, score]) => ({ workId, score: Math.round(score * 100) / 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Candidates of an open inbox card as of now: works created or merged after its events arrived
 * count, works merged away do not. The newest waiting event decides which types fit.
 */
export async function currentCandidates(db: Db, pending: typeof pendingMatches.$inferSelect): Promise<MatchCandidate[]> {
  const [newest] = await db
    .select({ chapter: events.chapter, season: events.season, episode: events.episode, percent: events.percent })
    .from(events)
    .where(
      and(eq(events.sourceId, pending.sourceId), eq(events.externalKey, pending.externalKey), eq(events.outcome, "pending")),
    )
    .orderBy(desc(events.occurredAt))
    .limit(1);
  return findCandidates(db, normalizeTitle(pending.rawTitle), newest ? positionFromColumns(newest).unit : "none");
}
