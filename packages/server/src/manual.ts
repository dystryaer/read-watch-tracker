import { randomUUID } from "node:crypto";
import { fitsMediaType, type Position } from "@rwt/core";
import { type Db, events, works } from "@rwt/db";
import { eq } from "drizzle-orm";
import { positionColumns } from "./work-progress";

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

/**
 * A change made in the web app (stepper, detail page). Unlike device events it may move the
 * position backwards (SPEC §5.3); it is logged as a "manual" event for the history.
 */
export async function setManualPosition(db: Db, workId: string, position: Position, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const [work] = await tx.select().from(works).where(eq(works.id, workId));
    if (!work) throw new WorkNotFoundError();
    if (position.unit === "none" || !fitsMediaType(work.type, position)) throw new WorkPositionMismatchError();

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
