import { type MediaType, normalizeTitle } from "@rwt/core";
import { type Db, events, pendingMatches, workLinks, works } from "@rwt/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { currentCandidates } from "./candidates";
import { applyProgress, lockWork, positionFromColumns } from "./work-progress";

export type Resolution =
  | { action: "link"; workId: string }
  | { action: "new_work"; type: MediaType; title?: string }
  | { action: "ignore" };

export class PendingMatchNotFoundError extends Error {
  constructor() {
    super("Pending match not found or already resolved");
    this.name = "PendingMatchNotFoundError";
  }
}

export const HIGH_CONFIDENCE_SCORE = 0.9;

type PendingMatch = typeof pendingMatches.$inferSelect;

/** Resolves an inbox card (SPEC §4.5) and replays its waiting events in time order. */
export async function resolvePendingMatch(
  db: Db,
  pendingId: string,
  resolution: Resolution,
  now = new Date(),
): Promise<{ workId: string | null; applied: number }> {
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(pendingMatches)
      .where(and(eq(pendingMatches.id, pendingId), isNull(pendingMatches.resolvedAt)));
    if (!pending) throw new PendingMatchNotFoundError();

    if (resolution.action === "ignore") {
      await tx
        .update(events)
        .set({ outcome: "ignored" })
        .where(waitingEventsOf(pending));
      await markResolved(tx, pending.id, "ignored", now);
      return { workId: null, applied: 0 };
    }

    const workId =
      resolution.action === "link" ? resolution.workId : await createWork(tx, resolution.type, resolution.title ?? pending.rawTitle);
    await tx
      .insert(workLinks)
      .values({
        workId,
        sourceId: pending.sourceId,
        externalKey: pending.externalKey,
        externalTitle: pending.rawTitle,
        externalTitleNormalized: normalizeTitle(pending.rawTitle),
        seriesUrl: pending.seriesUrl,
        coverUrl: pending.coverUrl,
      })
      // The key may have been linked meanwhile (e.g. by a concurrent event): the user's choice wins.
      .onConflictDoUpdate({ target: [workLinks.sourceId, workLinks.externalKey], set: { workId } });
    const applied = await replayWaitingEvents(tx, pending, workId, now);
    await markResolved(tx, pending.id, resolution.action === "link" ? "linked" : "new_work", now);
    return { workId, applied };
  });
}

/**
 * Bulk action after a backfill: links the (card, work) pairs the user saw. A pair is skipped when
 * its card is gone or its work is no longer a candidate scoring ≥ 0.9 (renamed, merged away).
 */
export async function confirmMatches(
  db: Db,
  pairs: { pendingId: string; workId: string }[],
  now = new Date(),
): Promise<number> {
  let confirmed = 0;
  for (const { pendingId, workId } of pairs) {
    const [pending] = await db
      .select()
      .from(pendingMatches)
      .where(and(eq(pendingMatches.id, pendingId), isNull(pendingMatches.resolvedAt)));
    if (!pending) continue;
    const candidates = await currentCandidates(db, pending);
    if (!candidates.some((candidate) => candidate.workId === workId && candidate.score >= HIGH_CONFIDENCE_SCORE)) continue;
    try {
      await resolvePendingMatch(db, pendingId, { action: "link", workId }, now);
      confirmed++;
    } catch (error) {
      if (!(error instanceof PendingMatchNotFoundError)) throw error; // resolved concurrently
    }
  }
  return confirmed;
}

/**
 * Closes the open card of a key that an event has just linked (SPEC §5.3 steps 3–4) and replays
 * the events that waited on it, so no card stays behind that can no longer be resolved.
 */
export async function answerOpenMatch(db: Db, sourceId: string, externalKey: string, workId: string, now: Date) {
  const [open] = await db
    .select()
    .from(pendingMatches)
    .where(
      and(eq(pendingMatches.sourceId, sourceId), eq(pendingMatches.externalKey, externalKey), isNull(pendingMatches.resolvedAt)),
    );
  if (!open) return;
  await replayWaitingEvents(db, open, workId, now);
  await markResolved(db, open.id, "linked", now);
}

function waitingEventsOf(pending: PendingMatch) {
  return and(
    eq(events.sourceId, pending.sourceId),
    eq(events.externalKey, pending.externalKey),
    eq(events.outcome, "pending"),
  );
}

async function createWork(db: Db, type: MediaType, title: string): Promise<string> {
  const [work] = await db
    .insert(works)
    .values({ type, title, titleNormalized: normalizeTitle(title) })
    .returning({ id: works.id });
  if (!work) throw new Error("Work could not be created");
  return work.id;
}

async function replayWaitingEvents(db: Db, pending: PendingMatch, workId: string, now: Date): Promise<number> {
  const waiting = await db.select().from(events).where(waitingEventsOf(pending)).orderBy(asc(events.occurredAt));
  let applied = 0;
  for (const event of waiting) {
    // Reloaded per event: each replayed event sees the progress of the previous one.
    const work = await lockWork(db, workId);
    if (!work) throw new Error(`Work ${workId} not found`);
    const outcome = await applyProgress(
      db,
      work,
      {
        position: positionFromColumns(event),
        kind: event.kind,
        sourceId: pending.sourceId,
        url: event.url,
        occurredAt: event.occurredAt,
      },
      now,
    );
    await db.update(events).set({ outcome, workId }).where(eq(events.id, event.id));
    if (outcome === "applied") applied++;
  }
  return applied;
}

async function markResolved(db: Db, id: string, resolution: "linked" | "new_work" | "ignored", now: Date) {
  await db.update(pendingMatches).set({ resolvedAt: now, resolution }).where(eq(pendingMatches.id, id));
}
