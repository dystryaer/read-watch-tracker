import { randomUUID } from "node:crypto";
import { type DbHandle, devices, events, workLinks, works } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WorkNotFoundError } from "../src/manual";
import {
  getWorkDetail,
  listMergeCandidates,
  MergeIncompatibleError,
  mergeWorks,
  unlinkWork,
  updateWorkMeta,
} from "../src/work-detail";
import { seedLink, seedSource, seedWork } from "./helpers";

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

async function seedEvent(workId: string, values: Partial<typeof events.$inferInsert> = {}) {
  await handle.db.insert(events).values({
    id: randomUUID(),
    kind: "read",
    chapter: 1,
    occurredAt: NOW,
    workId,
    outcome: "applied",
    ...values,
  });
}

describe("getWorkDetail", () => {
  it("returns the work with its links and newest events first", async () => {
    const source = await seedSource(handle.db, { key: "site:asura", name: "Asura" });
    const work = await seedWork(handle.db, { title: "Overgeared", chapter: 3 });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "overgeared", externalTitle: "Overgeared" });
    const [device] = await handle.db.insert(devices).values({ name: "Brave", kind: "extension" }).returning();
    await seedEvent(work.id, { chapter: 2, occurredAt: new Date("2026-10-20T10:00:00Z"), sourceId: source.id, deviceId: device?.id });
    await seedEvent(work.id, { chapter: 3, occurredAt: new Date("2026-10-21T10:00:00Z"), sourceId: source.id });

    const detail = await getWorkDetail(handle.db, work.id);

    expect(detail?.work.title).toBe("Overgeared");
    expect(detail?.links).toEqual([
      expect.objectContaining({ sourceName: "Asura", externalKey: "overgeared", externalTitle: "Overgeared" }),
    ]);
    expect(detail?.events.map((e) => e.chapter)).toEqual([3, 2]);
    expect(detail?.events[1]).toMatchObject({ deviceName: "Brave", sourceName: "Asura" });
  });

  it("limits the history to 50 events", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared" });
    for (let i = 0; i < 55; i++) await seedEvent(work.id, { occurredAt: new Date(NOW.getTime() - i * 1000) });

    expect((await getWorkDetail(handle.db, work.id))?.events).toHaveLength(50);
  });

  it("returns null for an unknown work", async () => {
    expect(await getWorkDetail(handle.db, randomUUID())).toBeNull();
  });

  it("tells which event re-recognized the series under a new key", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared" });
    await seedEvent(work.id, { externalKey: "overgeared-new", relinked: true });

    expect((await getWorkDetail(handle.db, work.id))?.events[0]).toMatchObject({ relinked: true, externalKey: "overgeared-new" });
  });
});

describe("updateWorkMeta", () => {
  it("renames the work and updates the normalized title", async () => {
    const work = await seedWork(handle.db, { title: "Overgeard" });

    await updateWorkMeta(handle.db, work.id, { title: "Overgeared’s Return" }, NOW);

    expect(await workById(work.id)).toMatchObject({ title: "Overgeared’s Return", titleNormalized: "overgeareds return" });
  });

  it("keeps the chapter when the type changes within chapter-based types", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared", type: "manhwa", chapter: 344 });

    await updateWorkMeta(handle.db, work.id, { type: "manga" }, NOW);

    expect(await workById(work.id)).toMatchObject({ type: "manga", chapter: 344 });
  });

  it("clears the position when the new type counts differently", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared", type: "manhwa", chapter: 344 });

    await updateWorkMeta(handle.db, work.id, { type: "anime" }, NOW);

    expect(await workById(work.id)).toMatchObject({ type: "anime", chapter: null, episode: null });
  });

  it("refuses an unknown work", async () => {
    await expect(updateWorkMeta(handle.db, randomUUID(), { title: "X" }, NOW)).rejects.toThrow(WorkNotFoundError);
  });
});

describe("unlinkWork", () => {
  it("removes one link of a work", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    const work = await seedWork(handle.db, { title: "Overgeared" });
    const link = await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "k", externalTitle: "T" });

    await unlinkWork(handle.db, work.id, link.id);

    expect(await handle.db.select().from(workLinks)).toHaveLength(0);
  });

  it("does not remove a link of another work", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    const work = await seedWork(handle.db, { title: "Overgeared" });
    const other = await seedWork(handle.db, { title: "Other" });
    const link = await seedLink(handle.db, { workId: other.id, sourceId: source.id, externalKey: "k", externalTitle: "T" });

    await unlinkWork(handle.db, work.id, link.id);

    expect(await handle.db.select().from(workLinks)).toHaveLength(1);
  });
});

describe("mergeWorks", () => {
  it("moves links and events to the target, keeps the higher position and deletes the source work", async () => {
    const a = await seedSource(handle.db, { key: "site:a" });
    const b = await seedSource(handle.db, { key: "site:b" });
    const duplicate = await seedWork(handle.db, { title: "Solo Leveling (copy)", chapter: 210, lastProgressAt: NOW, lastUrl: "https://b.example/sl/chapter-210" });
    const target = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200, lastProgressAt: new Date("2026-01-01T00:00:00Z") });
    await seedLink(handle.db, { workId: duplicate.id, sourceId: b.id, externalKey: "sl", externalTitle: "Solo Leveling" });
    await seedLink(handle.db, { workId: target.id, sourceId: a.id, externalKey: "solo", externalTitle: "Solo Leveling" });
    await seedEvent(duplicate.id);

    await mergeWorks(handle.db, duplicate.id, target.id, NOW);

    expect(await workById(duplicate.id)).toBeUndefined();
    expect(await workById(target.id)).toMatchObject({ chapter: 210, lastUrl: "https://b.example/sl/chapter-210", lastProgressAt: NOW });
    const links = await handle.db.select().from(workLinks);
    expect(links.every((link) => link.workId === target.id)).toBe(true);
    expect(links).toHaveLength(2);
    const [event] = await handle.db.select().from(events);
    expect(event?.workId).toBe(target.id);
  });

  it("keeps the newest chapter that was checked last", async () => {
    const into = await seedWork(handle.db, { title: "Overgeared", chapter: 10, latestChapter: 12, latestChapterAt: new Date("2026-10-01T00:00:00Z") });
    const from = await seedWork(handle.db, { title: "Overgeared (2)", chapter: 8, latestChapter: 15, latestChapterAt: new Date("2026-10-20T00:00:00Z") });

    await mergeWorks(handle.db, from.id, into.id, NOW);

    const [merged] = await handle.db.select().from(works).where(eq(works.id, into.id));
    expect(merged).toMatchObject({ latestChapter: 15, latestChapterAt: new Date("2026-10-20T00:00:00Z") });
  });

  it("refuses to merge works that count progress differently", async () => {
    const manhwa = await seedWork(handle.db, { title: "Solo Leveling", type: "manhwa" });
    const anime = await seedWork(handle.db, { title: "Solo Leveling", type: "anime" });

    await expect(mergeWorks(handle.db, manhwa.id, anime.id, NOW)).rejects.toThrow(MergeIncompatibleError);
  });

  it("refuses to merge a work into itself", async () => {
    const work = await seedWork(handle.db, { title: "X" });
    await expect(mergeWorks(handle.db, work.id, work.id, NOW)).rejects.toThrow(MergeIncompatibleError);
  });

  it("refuses an unknown work", async () => {
    const work = await seedWork(handle.db, { title: "X" });
    await expect(mergeWorks(handle.db, randomUUID(), work.id, NOW)).rejects.toThrow(WorkNotFoundError);
  });
});

describe("listMergeCandidates", () => {
  it("lists other works that count progress the same way, by title", async () => {
    const work = await seedWork(handle.db, { title: "Solo Leveling", type: "manhwa" });
    await seedWork(handle.db, { title: "Solo Leveling", type: "anime" });
    await seedWork(handle.db, { title: "Ore dake Level Up", type: "manga" });
    await seedWork(handle.db, { title: "Arise", type: "light_novel" });

    const candidates = await listMergeCandidates(handle.db, work.id);

    expect(candidates.map((c) => c.title)).toEqual(["Arise", "Ore dake Level Up"]);
  });
});
