import { type DbHandle, events, works } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setManualPosition, setWorkStatus, WorkNotFoundError, WorkPositionMismatchError } from "../src/manual";
import { seedWork } from "./helpers";

let handle: DbHandle;
const NOW = new Date("2026-10-21T20:00:00.000Z");

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  await resetDb(handle.db);
});

async function workById(id: string) {
  const [work] = await handle.db.select().from(works).where(eq(works.id, id));
  return work;
}

describe("setManualPosition", () => {
  it("sets a higher chapter and records a manual event without source", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared", chapter: 344 });

    await setManualPosition(handle.db, work.id, { unit: "chapter", chapter: 345 }, NOW);

    expect(await workById(work.id)).toMatchObject({ chapter: 345, lastProgressAt: NOW });
    const [event] = await handle.db.select().from(events);
    expect(event).toMatchObject({ kind: "manual", outcome: "applied", workId: work.id, sourceId: null, deviceId: null, chapter: 345 });
  });

  it("may move backwards, unlike automatic events", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared", chapter: 344 });

    await setManualPosition(handle.db, work.id, { unit: "chapter", chapter: 300 }, NOW);

    expect((await workById(work.id))?.chapter).toBe(300);
  });

  it("keeps the source of the last automatic progress", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared", chapter: 1, lastUrl: "https://a.example/x/chapter-1" });

    await setManualPosition(handle.db, work.id, { unit: "chapter", chapter: 2 }, NOW);

    expect((await workById(work.id))?.lastUrl).toBe("https://a.example/x/chapter-1");
  });

  it("sets an episode of an anime and keeps the season when none is given", async () => {
    const work = await seedWork(handle.db, { title: "Frieren", type: "anime", season: 2, episode: 3 });

    await setManualPosition(handle.db, work.id, { unit: "episode", season: null, episode: 4 }, NOW);

    expect(await workById(work.id)).toMatchObject({ season: 2, episode: 4 });
  });

  it("refuses a position that does not fit the type", async () => {
    const work = await seedWork(handle.db, { title: "Frieren", type: "anime" });

    await expect(setManualPosition(handle.db, work.id, { unit: "chapter", chapter: 1 }, NOW)).rejects.toThrow(
      WorkPositionMismatchError,
    );
    expect(await handle.db.select().from(events)).toHaveLength(0);
  });

  it("refuses an unknown work", async () => {
    await expect(
      setManualPosition(handle.db, crypto.randomUUID(), { unit: "chapter", chapter: 1 }, NOW),
    ).rejects.toThrow(WorkNotFoundError);
  });
});

describe("setWorkStatus", () => {
  it("changes the status", async () => {
    const work = await seedWork(handle.db, { title: "Solo Leveling" });

    await setWorkStatus(handle.db, work.id, "completed", NOW);

    expect(await workById(work.id)).toMatchObject({ status: "completed", updatedAt: NOW });
  });

  it("refuses an unknown work", async () => {
    await expect(setWorkStatus(handle.db, crypto.randomUUID(), "dropped", NOW)).rejects.toThrow(WorkNotFoundError);
  });
});
