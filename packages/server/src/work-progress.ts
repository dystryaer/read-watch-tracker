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

/** The stored position of a work, or null when it is unknown (e.g. imported without chapter). */
export function currentPosition(work: Work): Position | null {
  switch (positionUnitFor(work.type)) {
    case "chapter":
      return work.chapter === null ? null : { unit: "chapter", chapter: work.chapter };
    case "episode":
      return work.episode === null ? null : { unit: "episode", season: work.season, episode: work.episode };
    case "percent":
      return work.percent === null ? null : { unit: "percent", percent: work.percent };
    case "none":
      return null;
  }
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
    lastProgressAt: update.occurredAt,
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
