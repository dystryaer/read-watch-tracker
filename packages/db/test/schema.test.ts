import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type DbHandle, pendingMatches, sourceDomains, sources, workLinks, works } from "../src/index";
import { createTestDb, resetDb } from "../src/testing";

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

async function insertSource(key = "site:asura") {
  const [source] = await handle.db.insert(sources).values({ key, name: key, kind: "website" }).returning();
  if (!source) throw new Error("insert failed");
  return source;
}

async function insertWork(values: Partial<typeof works.$inferInsert> = {}) {
  const [work] = await handle.db
    .insert(works)
    .values({ type: "manhwa", title: "Overgeared", titleNormalized: "overgeared", ...values })
    .returning();
  if (!work) throw new Error("insert failed");
  return work;
}

describe("migrations", () => {
  it("enable pg_trgm similarity", async () => {
    await insertWork();
    const [row] = await handle.db
      .select({ score: sql<number>`similarity(${works.titleNormalized}, 'over geared')`.mapWith(Number) })
      .from(works);
    expect(row?.score).toBeGreaterThan(0.3);
  });
});

describe("works", () => {
  it("stores decimal chapters as numbers", async () => {
    const work = await insertWork({ chapter: 105.5 });
    expect(work.chapter).toBe(105.5);
  });

  it("defaults to status reading and an unknown position", async () => {
    const work = await insertWork();
    expect(work).toMatchObject({ status: "reading", chapter: null, season: null, episode: null, percent: null });
  });

  it.each([
    [{ type: "manhwa", season: 1 }],
    [{ type: "manga", percent: 40 }],
    [{ type: "anime", chapter: 3 }],
    [{ type: "series", season: 2, episode: null }],
    [{ type: "ebook", chapter: 1 }],
    [{ type: "movie", episode: 1 }],
  ] as const)("rejects position columns that do not fit the type: %j", async (values) => {
    await expect(insertWork(values)).rejects.toThrow();
  });

  it.each([
    [{ type: "anime", season: 1, episode: 14 }],
    [{ type: "anime", episode: 3 }],
    [{ type: "ebook", percent: 43.25 }],
    [{ type: "light_novel", chapter: 1204 }],
    [{ type: "movie" }],
  ] as const)("accepts fitting position columns: %j", async (values) => {
    await expect(insertWork(values)).resolves.toBeDefined();
  });
});

describe("work_links", () => {
  it("allows one link per source and external key", async () => {
    const source = await insertSource();
    const work = await insertWork();
    const link = { workId: work.id, sourceId: source.id, externalKey: "overgeared", externalTitle: "Overgeared", externalTitleNormalized: "overgeared" };

    await handle.db.insert(workLinks).values(link);
    await expect(handle.db.insert(workLinks).values(link)).rejects.toThrow();
  });

  it("is removed together with its work", async () => {
    const source = await insertSource();
    const work = await insertWork();
    await handle.db.insert(workLinks).values({ workId: work.id, sourceId: source.id, externalKey: "k", externalTitle: "T", externalTitleNormalized: "t" });

    await handle.db.delete(works).where(eq(works.id, work.id));

    expect(await handle.db.select().from(workLinks)).toHaveLength(0);
  });
});

describe("source_domains", () => {
  it("allows only one current domain per source", async () => {
    const source = await insertSource();
    await handle.db.insert(sourceDomains).values({ domain: "asuracomic.net", sourceId: source.id, isCurrent: true });

    await expect(
      handle.db.insert(sourceDomains).values({ domain: "asurascans.com", sourceId: source.id, isCurrent: true }),
    ).rejects.toThrow();
  });

  it("allows several old domains", async () => {
    const source = await insertSource();
    await handle.db.insert(sourceDomains).values([
      { domain: "a.example", sourceId: source.id },
      { domain: "b.example", sourceId: source.id },
      { domain: "c.example", sourceId: source.id, isCurrent: true },
    ]);
    expect(await handle.db.select().from(sourceDomains)).toHaveLength(3);
  });
});

describe("pending_matches", () => {
  it("allows only one open match per source and key", async () => {
    const source = await insertSource();
    const open = { sourceId: source.id, externalKey: "k", rawTitle: "T" };
    await handle.db.insert(pendingMatches).values(open);
    await expect(handle.db.insert(pendingMatches).values(open)).rejects.toThrow();
  });

  it("allows a new open match once the previous one is resolved", async () => {
    const source = await insertSource();
    const open = { sourceId: source.id, externalKey: "k", rawTitle: "T" };
    await handle.db.insert(pendingMatches).values({ ...open, resolvedAt: new Date(), resolution: "linked" });
    await expect(handle.db.insert(pendingMatches).values(open)).resolves.toBeDefined();
  });
});
