import { type DbHandle, pendingMatches, workLinks, works } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { countOpenPending, listOverview } from "../src/overview";
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
