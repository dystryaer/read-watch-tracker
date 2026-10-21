import { randomUUID } from "node:crypto";
import { comparePositions, fitsMediaType, type Position } from "@rwt/core";
import { type Db, events, works } from "@rwt/db";
import { eq } from "drizzle-orm";
import { currentPosition, positionColumns } from "./work-progress";

export type WorkStatus = (typeof works.$inferSelect)["status"];

export class WorkNotFoundError extends Error {
  constructor() {
    super("Work not found");
    this.name = "WorkNotFoundError";
  }
}

export class WorkPositionMismatchError extends Error {
  constructor() {
    super("Position does not fit the work's media type");
    this.name = "WorkPositionMismatchError";
  }
}

/** The position changed since the screen was loaded (another device, an app resumed from the background). */
export class WorkPositionChangedError extends Error {
  constructor() {
    super("Position changed meanwhile");
    this.name = "WorkPositionChangedError";
  }
}

function samePosition(a: Position | null, b: Position | null): boolean {
  if (a === null || b === null) return a === b;
  return a.unit === b.unit && comparePositions(a, b) === 0;
}

/**
 * A change made in the web app (stepper, detail page). Unlike device events it may move the
 * position backwards (SPEC §5.3); it is logged as a "manual" event for the history. With `expected`
 * – the position a stepper started from – a step from an outdated screen is refused instead of
 * moving the work back.
 */
export async function setManualPosition(
  db: Db,
  workId: string,
  position: Position,
  now = new Date(),
  { expected }: { expected?: Position | null } = {},
): Promise<void> {
  await db.transaction(async (tx) => {
    const [work] = await tx.select().from(works).where(eq(works.id, workId)).for("update");
    if (!work) throw new WorkNotFoundError();
    if (position.unit === "none" || !fitsMediaType(work.type, position)) throw new WorkPositionMismatchError();
    if (expected !== undefined && !samePosition(currentPosition(work), expected)) throw new WorkPositionChangedError();

    const columns = positionColumns(position, work);
    await tx
      .update(works)
      .set({ ...columns, lastProgressAt: now, updatedAt: now })
      .where(eq(works.id, workId));
    await tx.insert(events).values({
      id: randomUUID(),
      kind: "manual",
      ...columns,
      occurredAt: now,
      receivedAt: now,
      workId,
      outcome: "applied",
    });
  });
}

export async function setWorkStatus(db: Db, workId: string, status: WorkStatus, now = new Date()): Promise<void> {
  const updated = await db
    .update(works)
    .set({ status, updatedAt: now })
    .where(eq(works.id, workId))
    .returning({ id: works.id });
  if (updated.length === 0) throw new WorkNotFoundError();
}
