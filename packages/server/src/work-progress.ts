import { type EventKind, fitsMediaType, MediaType, type Position, positionUnitFor, shouldAdvance } from "@rwt/core";
import { type Db, works } from "@rwt/db";
import { eq } from "drizzle-orm";

export type Work = typeof works.$inferSelect;

export interface ProgressUpdate {
  position: Position;
  // "manual" comes from the web UI (SPEC §5.3) and is stored, but never sent by devices.
  kind: EventKind | "manual";
  sourceId: string;
  url: string | null;
  occurredAt: Date;
}

interface PositionColumnValues {
  chapter: number | null;
  season: number | null;
  episode: number | null;
  percent: number | null;
}

/** The position held by stored columns (a work's or an event's); "none" when none is set. */
export function positionFromColumns(columns: PositionColumnValues): Position {
  if (columns.chapter !== null) return { unit: "chapter", chapter: columns.chapter };
  if (columns.episode !== null) return { unit: "episode", season: columns.season, episode: columns.episode };
  if (columns.percent !== null) return { unit: "percent", percent: columns.percent };
  return { unit: "none" };
}

/** The stored position of a work, or null when it is unknown (e.g. imported without chapter). */
export function currentPosition(work: Work): Position | null {
  const position = positionFromColumns(work);
  return position.unit !== "none" && position.unit === positionUnitFor(work.type) ? position : null;
}

/** Loads a work and locks its row until the transaction ends, so concurrent events cannot overwrite each other. */
export async function lockWork(db: Db, workId: string): Promise<Work | null> {
  const [work] = await db.select().from(works).where(eq(works.id, workId)).for("update");
  return work ?? null;
}

/** Column values for a position; an episode without season keeps the stored season. */
export function positionColumns(position: Position, work?: Work) {
  return {
    chapter: position.unit === "chapter" ? position.chapter : null,
    season: position.unit === "episode" ? (position.season ?? work?.season ?? null) : null,
    episode: position.unit === "episode" ? position.episode : null,
    percent: position.unit === "percent" ? position.percent : null,
  };
}

export function mediaTypesFor(unit: Position["unit"]): MediaType[] {
  return MediaType.options.filter((type) => positionUnitFor(type) === unit);
}

/** Moves a work forward (SPEC §5.3 "Fortschritt"); never backwards. */
export async function applyProgress(
  db: Db,
  work: Work,
  update: ProgressUpdate,
  now: Date,
): Promise<"applied" | "no_change"> {
  const lastActivity = {
    lastSourceId: update.sourceId,
    // Without a URL the old one would point at an older chapter, so it is cleared.
    lastUrl: update.url,
    // Replayed or backfilled events can be weeks old: "Zuletzt aktiv" never moves back.
    lastProgressAt:
      work.lastProgressAt !== null && work.lastProgressAt > update.occurredAt ? work.lastProgressAt : update.occurredAt,
    updatedAt: now,
  };

  if (update.position.unit === "none") {
    if (update.kind !== "watched" || work.type !== "movie" || work.status === "completed") return "no_change";
    await db.update(works).set({ status: "completed", ...lastActivity }).where(eq(works.id, work.id));
    return "applied";
  }

  if (!fitsMediaType(work.type, update.position)) return "no_change";
  if (!shouldAdvance(currentPosition(work), update.position)) return "no_change";

  await db
    .update(works)
    .set({ ...positionColumns(update.position, work), ...lastActivity })
    .where(eq(works.id, work.id));
  return "applied";
}
