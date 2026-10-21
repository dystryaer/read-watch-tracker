import { type DbHandle, events } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { progressStats } from "../src/stats";
import { seedWork } from "./helpers";

let handle: DbHandle;
const NOW = new Date("2026-10-28T10:00:00.000Z");

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  await resetDb(handle.db);
});

type EventValues = typeof events.$inferInsert;

async function logEvent(values: Partial<EventValues> & Pick<EventValues, "occurredAt">) {
  await handle.db.insert(events).values({ id: crypto.randomUUID(), kind: "read", outcome: "applied", receivedAt: values.occurredAt, ...values });
}

describe("progressStats (SPEC §4.8)", () => {
  it("counts the chapters each work moved forward, measured from its previous applied event", async () => {
    const work = await seedWork(handle.db, { title: "Shadow Slave", type: "light_novel" });
    // Before the window: only the base for the first step inside it.
    await logEvent({ workId: work.id, chapter: 1100, occurredAt: new Date("2025-01-10T12:00:00Z") });
    await logEvent({ workId: work.id, kind: "library_sync", chapter: 1104, occurredAt: new Date("2026-10-20T12:00:00Z") });
    await logEvent({ workId: work.id, kind: "manual", chapter: 1106, occurredAt: new Date("2026-10-27T12:00:00Z") });
    // Not applied: counts nothing and is no base either.
    await logEvent({ workId: work.id, chapter: 1300, outcome: "no_change", occurredAt: new Date("2026-10-27T13:00:00Z") });

    const { weeks, months } = await progressStats(handle.db, NOW);

    expect(weeks[0]).toEqual({ start: "2026-10-26", chapters: 2, episodes: 0 });
    expect(weeks[1]).toEqual({ start: "2026-10-19", chapters: 4, episodes: 0 });
    expect(months[0]).toEqual({ month: "2026-10", chapters: 6, episodes: 0 });
  });

  it("counts a work's first event as one and episodes per season", async () => {
    const novel = await seedWork(handle.db, { title: "Lord of Mysteries", type: "light_novel" });
    const anime = await seedWork(handle.db, { title: "Frieren", type: "anime" });
    await logEvent({ workId: novel.id, chapter: 812, occurredAt: new Date("2026-10-27T12:00:00Z") });
    await logEvent({ workId: anime.id, kind: "watched", season: 1, episode: 5, occurredAt: new Date("2026-10-26T18:00:00Z") });
    await logEvent({ workId: anime.id, kind: "watched", season: 1, episode: 7, occurredAt: new Date("2026-10-27T18:00:00Z") });

    const { weeks } = await progressStats(handle.db, NOW);

    expect(weeks[0]).toEqual({ start: "2026-10-26", chapters: 1, episodes: 3 });
  });

  it("leaves out events without a work (pending cards)", async () => {
    await logEvent({ chapter: 10, outcome: "pending", occurredAt: new Date("2026-10-27T12:00:00Z") });
    const { weeks } = await progressStats(handle.db, NOW);
    expect(weeks[0]?.chapters).toBe(0);
  });
});
