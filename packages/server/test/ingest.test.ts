import { type DbHandle, events, pendingMatches, sources, workLinks, works } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ingestEvents } from "../src/ingest";
import { chapterEvent, seedLink, seedSource, seedWork } from "./helpers";

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

async function seedLinkedOvergeared(position: { chapter?: number | null } = { chapter: 344 }) {
  const source = await seedSource(handle.db, { key: "site:asura" }, ["asuracomic.net"]);
  const work = await seedWork(handle.db, { title: "Overgeared", chapter: position.chapter ?? null });
  await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "overgeared", externalTitle: "Overgeared" });
  return { source, work };
}

describe("ingestEvents – linked series", () => {
  it("applies a higher chapter and records where it was read", async () => {
    const { source, work } = await seedLinkedOvergeared();
    const event = chapterEvent({ chapter: 345 });

    const [result] = await ingestEvents(handle.db, null, [event], NOW);

    expect(result).toEqual({ id: event.id, outcome: "applied" });
    expect(await workById(work.id)).toMatchObject({
      chapter: 345,
      lastSourceId: source.id,
      lastUrl: "https://asuracomic.net/series/overgeared/chapter/345",
      lastProgressAt: new Date("2026-10-21T18:00:00.000Z"),
    });
  });

  it("does not move back when an older chapter is re-read", async () => {
    const { work } = await seedLinkedOvergeared({ chapter: 150 });

    const [result] = await ingestEvents(handle.db, null, [chapterEvent({ chapter: 100 })], NOW);

    expect(result?.outcome).toBe("no_change");
    expect((await workById(work.id))?.chapter).toBe(150);
  });

  it("fills an unknown position from the import", async () => {
    const { work } = await seedLinkedOvergeared({ chapter: null });

    const [result] = await ingestEvents(handle.db, null, [chapterEvent({ chapter: 12 })], NOW);

    expect(result?.outcome).toBe("applied");
    expect((await workById(work.id))?.chapter).toBe(12);
  });

  it("stores every event with its outcome and raw data", async () => {
    const { work } = await seedLinkedOvergeared();
    const event = chapterEvent({ chapter: 345 });

    await ingestEvents(handle.db, null, [event], NOW);

    const [stored] = await handle.db.select().from(events).where(eq(events.id, event.id));
    expect(stored).toMatchObject({
      outcome: "applied",
      workId: work.id,
      kind: "read",
      chapter: 345,
      rawTitle: "Overgeared",
      externalKey: "overgeared",
      receivedAt: NOW,
    });
  });

  it("updates the link's series URL when the event brings one", async () => {
    await seedLinkedOvergeared();
    const event = chapterEvent({ source: { seriesUrl: "https://asuracomic.net/series/overgeared" } });

    await ingestEvents(handle.db, null, [event], NOW);

    const [link] = await handle.db.select().from(workLinks);
    expect(link?.seriesUrl).toBe("https://asuracomic.net/series/overgeared");
  });

  it("does not apply a position that does not fit the work's type", async () => {
    const { work } = await seedLinkedOvergeared();
    const event = chapterEvent({ position: { unit: "episode", season: 1, episode: 3 } });

    const [result] = await ingestEvents(handle.db, null, [event], NOW);

    expect(result?.outcome).toBe("no_change");
    expect((await workById(work.id))?.chapter).toBe(344);
  });

  it("uses the receive time for timestamps from the future", async () => {
    const { work } = await seedLinkedOvergeared();

    await ingestEvents(handle.db, null, [chapterEvent({ occurredAt: "2030-01-01T00:00:00.000Z" })], NOW);

    expect((await workById(work.id))?.lastProgressAt).toEqual(NOW);
  });
});

describe("ingestEvents – idempotency", () => {
  it("ignores an event id that was already processed", async () => {
    await seedLinkedOvergeared();
    const event = chapterEvent();

    await ingestEvents(handle.db, null, [event], NOW);
    const [second] = await ingestEvents(handle.db, null, [event], NOW);

    expect(second?.outcome).toBe("no_change");
    expect(await handle.db.select().from(events)).toHaveLength(1);
  });

  it("ignores a duplicate id within the same batch", async () => {
    await seedLinkedOvergeared();
    const event = chapterEvent();

    const results = await ingestEvents(handle.db, null, [event, event], NOW);

    expect(results.map((r) => r.outcome)).toEqual(["applied", "no_change"]);
  });
});

describe("ingestEvents – unknown series", () => {
  it("creates a pending match with the imported work as candidate", async () => {
    await seedSource(handle.db, { key: "site:asura" }, ["asuracomic.net"]);
    const imported = await seedWork(handle.db, { title: "Overgeared", chapter: 344 });

    const [result] = await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    expect(result?.outcome).toBe("pending");
    const [pending] = await handle.db.select().from(pendingMatches);
    expect(pending).toMatchObject({ externalKey: "overgeared", rawTitle: "Overgeared", eventCount: 1, resolvedAt: null });
    expect(pending?.candidates[0]).toMatchObject({ workId: imported.id });
    expect(pending?.candidates[0]?.score).toBeGreaterThan(0.9);
    expect((await workById(imported.id))?.chapter).toBe(344);
  });

  it("counts further events on the same open match", async () => {
    await seedSource(handle.db, { key: "site:asura" });

    await ingestEvents(handle.db, null, [chapterEvent({ chapter: 1 }), chapterEvent({ chapter: 2 })], NOW);

    const open = await handle.db.select().from(pendingMatches);
    expect(open).toHaveLength(1);
    expect(open[0]?.eventCount).toBe(2);
  });

  it("only suggests works whose type fits the position", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    await seedWork(handle.db, { title: "Overgeared", type: "anime" });
    const manhwa = await seedWork(handle.db, { title: "Overgeared!", type: "manhwa" });

    await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    const [pending] = await handle.db.select().from(pendingMatches);
    expect(pending?.candidates.map((c) => c.workId)).toEqual([manhwa.id]);
  });

  it("suggests at most three candidates", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    for (const suffix of ["", " 2", " 3", " 4"]) await seedWork(handle.db, { title: `Overgeared${suffix}` });

    await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    const [pending] = await handle.db.select().from(pendingMatches);
    expect(pending?.candidates).toHaveLength(3);
  });

  it("never links by similarity alone", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    await seedWork(handle.db, { title: "Overgeared" });

    await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    expect(await handle.db.select().from(workLinks)).toHaveLength(0);
  });

  it("drops events of a key that was ignored", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    await handle.db.insert(pendingMatches).values({
      sourceId: source.id,
      externalKey: "overgeared",
      rawTitle: "Overgeared",
      resolvedAt: NOW,
      resolution: "ignored",
    });

    const [result] = await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    expect(result?.outcome).toBe("ignored");
    expect(await handle.db.select().from(pendingMatches)).toHaveLength(1);
  });
});

describe("ingestEvents – re-recognition after a key change (§5.3 step 4)", () => {
  it("links a new key with exactly the same title on the same source", async () => {
    const { work } = await seedLinkedOvergeared();
    const event = chapterEvent({ source: { externalKey: "overgeared-new-slug" }, chapter: 345 });

    const [result] = await ingestEvents(handle.db, null, [event], NOW);

    expect(result?.outcome).toBe("applied");
    expect((await workById(work.id))?.chapter).toBe(345);
    const links = await handle.db.select().from(workLinks).where(eq(workLinks.workId, work.id));
    expect(links.map((l) => l.externalKey).sort()).toEqual(["overgeared", "overgeared-new-slug"]);
  });

  it("matches titles after normalization", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    const work = await seedWork(handle.db, { title: "Swordmaster's Youngest Son", chapter: 1 });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "a", externalTitle: "Swordmaster’s Youngest Son" });

    const event = chapterEvent({ source: { externalKey: "b", rawTitle: "Swordmasters Youngest Son" }, chapter: 2 });
    const [result] = await ingestEvents(handle.db, null, [event], NOW);

    expect(result?.outcome).toBe("applied");
  });

  it("does not re-recognize across different sources", async () => {
    await seedLinkedOvergeared();
    await seedSource(handle.db, { key: "site:other" });

    const event = chapterEvent({ source: { key: "site:other", externalKey: "overgeared-x", url: undefined } });
    const [result] = await ingestEvents(handle.db, null, [event], NOW);

    expect(result?.outcome).toBe("pending");
  });
});

describe("ingestEvents – sources", () => {
  it("resolves the source by the URL's domain before the key (domain moves)", async () => {
    const { work } = await seedLinkedOvergeared();
    const event = chapterEvent({
      chapter: 400,
      source: { key: "site:stale-key", url: "https://www.asuracomic.net/series/overgeared/chapter/400" },
    });

    const [result] = await ingestEvents(handle.db, null, [event], NOW);

    expect(result?.outcome).toBe("applied");
    expect((await workById(work.id))?.chapter).toBe(400);
  });

  it("creates an unknown streaming source with the streaming kind", async () => {
    const event = chapterEvent({
      kind: "watched",
      source: { key: "crunchyroll", externalKey: "frieren", rawTitle: "Frieren", url: undefined },
      position: { unit: "episode", season: 1, episode: 14 },
    });

    await ingestEvents(handle.db, null, [event], NOW);

    const [source] = await handle.db.select().from(sources).where(eq(sources.key, "crunchyroll"));
    expect(source).toMatchObject({ kind: "streaming", name: "Crunchyroll" });
  });

  it("creates other unknown keys as websites", async () => {
    await ingestEvents(handle.db, null, [chapterEvent({ source: { key: "site:new", url: undefined } })], NOW);

    const [source] = await handle.db.select().from(sources).where(eq(sources.key, "site:new"));
    expect(source?.kind).toBe("website");
  });
});

describe("ingestEvents – other media", () => {
  it("advances episodes of an anime", async () => {
    const source = await seedSource(handle.db, { key: "crunchyroll", kind: "streaming" });
    const work = await seedWork(handle.db, { title: "Frieren", type: "anime", season: 1, episode: 13 });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "frieren", externalTitle: "Frieren" });

    const event = chapterEvent({
      kind: "watched",
      source: { key: "crunchyroll", externalKey: "frieren", rawTitle: "Frieren", url: undefined },
      position: { unit: "episode", season: null, episode: 14 },
    });
    const [result] = await ingestEvents(handle.db, null, [event], NOW);

    expect(result?.outcome).toBe("applied");
    expect(await workById(work.id)).toMatchObject({ season: 1, episode: 14 });
  });

  it("marks a watched movie as completed", async () => {
    const source = await seedSource(handle.db, { key: "netflix", kind: "streaming" });
    const work = await seedWork(handle.db, { title: "Suzume", type: "movie" });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "suzume", externalTitle: "Suzume" });

    const event = chapterEvent({
      kind: "watched",
      source: { key: "netflix", externalKey: "suzume", rawTitle: "Suzume", url: undefined },
      position: { unit: "none" },
    });
    const [result] = await ingestEvents(handle.db, null, [event], NOW);

    expect(result?.outcome).toBe("applied");
    expect((await workById(work.id))?.status).toBe("completed");
  });

  it("advances an e-book percentage", async () => {
    const source = await seedSource(handle.db, { key: "kindle", kind: "app" });
    const work = await seedWork(handle.db, { title: "Project Hail Mary", type: "ebook", percent: 40 });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "b08fhbv4zx", externalTitle: "Project Hail Mary" });

    const event = chapterEvent({
      kind: "library_sync",
      source: { key: "kindle", externalKey: "b08fhbv4zx", rawTitle: "Project Hail Mary", url: undefined },
      position: { unit: "percent", percent: 43.5 },
    });
    await ingestEvents(handle.db, null, [event], NOW);

    expect((await workById(work.id))?.percent).toBe(43.5);
  });
});
