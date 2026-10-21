import type { MediaType } from "@rwt/core";
import { type Db, events, pendingMatches, sources, works } from "@rwt/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

interface PositionColumns {
  chapter: number | null;
  season: number | null;
  episode: number | null;
  percent: number | null;
}

export interface OpenMatch {
  id: string;
  rawTitle: string;
  sourceName: string;
  externalKey: string;
  eventCount: number;
  lastSeenAt: Date;
  /** Position of the newest waiting event, shown as "zuletzt Kap. 217". */
  lastPosition: PositionColumns | null;
  suggestedType: MediaType;
  candidates: ({ workId: string; title: string; type: MediaType; score: number } & PositionColumns)[];
}

function typeForPosition(position: PositionColumns | null): MediaType {
  if (position?.episode != null) return "anime";
  if (position?.percent != null) return "ebook";
  return "manhwa";
}

/** Open inbox cards (SPEC §4.5), most recently seen first. */
export async function listOpenMatches(db: Db): Promise<OpenMatch[]> {
  const open = await db
    .select({ match: pendingMatches, sourceName: sources.name, sourceDefaultType: sources.defaultMediaType })
    .from(pendingMatches)
    .innerJoin(sources, eq(sources.id, pendingMatches.sourceId))
    .where(isNull(pendingMatches.resolvedAt))
    .orderBy(desc(pendingMatches.lastSeenAt));
  if (open.length === 0) return [];

  const waiting = await db
    .select({
      sourceId: events.sourceId,
      externalKey: events.externalKey,
      chapter: events.chapter,
      season: events.season,
      episode: events.episode,
      percent: events.percent,
    })
    .from(events)
    .where(
      and(
        eq(events.outcome, "pending"),
        inArray(
          events.sourceId,
          open.map(({ match }) => match.sourceId),
        ),
      ),
    )
    .orderBy(desc(events.occurredAt));
  const newestWaiting = new Map<string, PositionColumns>();
  for (const { sourceId, externalKey, ...position } of waiting) {
    const key = `${sourceId}\n${externalKey}`;
    if (!newestWaiting.has(key)) newestWaiting.set(key, position);
  }

  const candidateIds = [...new Set(open.flatMap(({ match }) => match.candidates.map((c) => c.workId)))];
  const candidateWorks =
    candidateIds.length === 0
      ? []
      : await db
          .select({
            id: works.id,
            title: works.title,
            type: works.type,
            chapter: works.chapter,
            season: works.season,
            episode: works.episode,
            percent: works.percent,
          })
          .from(works)
          .where(inArray(works.id, candidateIds));
  const worksById = new Map(candidateWorks.map((work) => [work.id, work]));

  return open.map(({ match, sourceName, sourceDefaultType }) => {
    const lastPosition = newestWaiting.get(`${match.sourceId}\n${match.externalKey}`) ?? null;
    return {
      id: match.id,
      rawTitle: match.rawTitle,
      sourceName,
      externalKey: match.externalKey,
      eventCount: match.eventCount,
      lastSeenAt: match.lastSeenAt,
      lastPosition,
      suggestedType: match.mediaTypeHint ?? sourceDefaultType ?? typeForPosition(lastPosition),
      // Candidates are stored as ids; a work merged away since then simply drops out.
      candidates: match.candidates.flatMap(({ workId, score }) => {
        const work = worksById.get(workId);
        if (!work) return [];
        const { title, type, chapter, season, episode, percent } = work;
        return [{ workId, score, title, type, chapter, season, episode, percent }];
      }),
    };
  });
}
