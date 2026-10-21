import { type DbHandle, pendingMatches, workLinks, works } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ingestEvents } from "../src/ingest";
import { countOpenPending, listOverview, webnovelSyncStatus } from "../src/overview";
import { seedLink, seedSource, seedWork } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  await resetDb(handle.db);
});

describe("listOverview", () => {
  it("returns each work with its last source, current domain, series URL and aliases", async () => {
    const source = await seedSource(
      handle.db,
      { key: "site:asura", name: "Asura", ruleNextUrlTemplate: "{seriesUrl}/chapter/{next}" },
      ["asuracomic.net", "asurascans.com"],
    );
    const work = await seedWork(handle.db, { title: "Overgeared", chapter: 345 });
    await handle.db
      .update(works)
      .set({ lastSourceId: source.id, lastUrl: "https://asuracomic.net/series/overgeared/chapter/345" })
      .where(eq(works.id, work.id));
    await seedLink(handle.db, {
      workId: work.id,
      sourceId: source.id,
      externalKey: "overgeared",
      externalTitle: "Overgeared (Manhwa)",
      seriesUrl: "https://asuracomic.net/series/overgeared",
    });

    const [row] = await listOverview(handle.db);

    expect(row).toMatchObject({
      id: work.id,
      title: "Overgeared",
      chapter: 345,
      lastUrl: "https://asuracomic.net/series/overgeared/chapter/345",
      source: {
        key: "site:asura",
        name: "Asura",
        kind: "website",
        currentDomain: "asurascans.com",
        nextUrlTemplate: "{seriesUrl}/chapter/{next}",
      },
      seriesUrl: "https://asuracomic.net/series/overgeared",
      aliases: ["Overgeared (Manhwa)"],
    });
  });

  it("returns imported works without a source", async () => {
    await seedWork(handle.db, { title: "Ranker's Return" });

    const [row] = await listOverview(handle.db);

    expect(row).toMatchObject({ title: "Ranker's Return", chapter: null, source: null, seriesUrl: null, aliases: [] });
  });

  it("returns every work exactly once even with several links", async () => {
    const a = await seedSource(handle.db, { key: "site:a" });
    const b = await seedSource(handle.db, { key: "site:b" });
    const work = await seedWork(handle.db, { title: "Solo Leveling" });
    await seedLink(handle.db, { workId: work.id, sourceId: a.id, externalKey: "x", externalTitle: "Solo Leveling" });
    await seedLink(handle.db, { workId: work.id, sourceId: b.id, externalKey: "y", externalTitle: "Only I Level Up" });

    const rows = await listOverview(handle.db);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.aliases.sort()).toEqual(["Only I Level Up", "Solo Leveling"]);
  });
});

describe("countOpenPending", () => {
  it("counts only unresolved matches", async () => {
    const source = await seedSource(handle.db, { key: "site:a" });
    await handle.db.insert(pendingMatches).values([
      { sourceId: source.id, externalKey: "a", rawTitle: "A" },
      { sourceId: source.id, externalKey: "b", rawTitle: "B" },
      { sourceId: source.id, externalKey: "c", rawTitle: "C", resolvedAt: new Date(), resolution: "ignored" },
    ]);

    expect(await countOpenPending(handle.db)).toBe(2);
  });
});

describe("listOverview – series URL", () => {
  it("takes the series URL of the most recently confirmed link of the last source", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    const work = await seedWork(handle.db, { title: "Overgeared" });
    await handle.db.update(works).set({ lastSourceId: source.id }).where(eq(works.id, work.id));
    const newer = await seedLink(handle.db, {
      workId: work.id,
      sourceId: source.id,
      externalKey: "overgeared-new",
      externalTitle: "Overgeared",
      seriesUrl: "https://asuracomic.net/series/overgeared-new",
    });
    const older = await seedLink(handle.db, {
      workId: work.id,
      sourceId: source.id,
      externalKey: "overgeared",
      externalTitle: "Overgeared",
      seriesUrl: "https://asuracomic.net/series/overgeared",
    });
    await handle.db.update(workLinks).set({ confirmedAt: new Date("2026-10-01T00:00:00Z") }).where(eq(workLinks.id, older.id));
    await handle.db.update(workLinks).set({ confirmedAt: new Date("2026-10-20T00:00:00Z") }).where(eq(workLinks.id, newer.id));

    const [row] = await listOverview(handle.db);

    expect(row?.seriesUrl).toBe("https://asuracomic.net/series/overgeared-new");
  });
});

describe("webnovelSyncStatus", () => {
  const T1 = new Date("2026-10-01T12:00:00.000Z");
  const T2 = new Date("2026-10-10T12:00:00.000Z");
  const libraryEvent = (id: string, chapter: number) => ({
    id,
    occurredAt: T1.toISOString(),
    kind: "library_sync" as const,
    source: { key: "webnovel", externalKey: "22196546206090805", rawTitle: "Shadow Slave" },
    position: { unit: "chapter" as const, chapter },
  });

  it("knows when the WebNovel library last came in, also when nothing in it changed", async () => {
    const first = libraryEvent(crypto.randomUUID(), 1204);
    await ingestEvents(handle.db, null, [first], T1);
    // Opened again days later: the same ids, stored as duplicates – it was synced all the same.
    await ingestEvents(handle.db, null, [first], T2);

    expect((await webnovelSyncStatus(handle.db)).lastSync).toEqual(T2);
  });

  it("does not count other events of WebNovel as a library sync", async () => {
    await ingestEvents(handle.db, null, [{ ...libraryEvent(crypto.randomUUID(), 1204), kind: "read" }], T2);
    expect((await webnovelSyncStatus(handle.db)).lastSync).toBeNull();
  });

  it("asks for a sync only from people who read on WebNovel", async () => {
    await seedWork(handle.db, { title: "Lord of Mysteries", type: "light_novel", status: "reading" });
    expect((await webnovelSyncStatus(handle.db)).readsOnWebnovel).toBe(false);

    const source = await seedSource(handle.db, { key: "webnovel", kind: "app", defaultMediaType: "light_novel" });
    const work = await seedWork(handle.db, { title: "Shadow Slave", type: "light_novel", status: "reading" });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "22196546206090805", externalTitle: "Shadow Slave" });
    expect((await webnovelSyncStatus(handle.db)).readsOnWebnovel).toBe(true);
  });

  it("reports no sync and no WebNovel reading on an empty tracker", async () => {
    expect(await webnovelSyncStatus(handle.db)).toEqual({ lastSync: null, readsOnWebnovel: false });
  });
});
