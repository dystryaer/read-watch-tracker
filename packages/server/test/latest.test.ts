import { type DbHandle, works } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordLatestChapters, seriesToWatch } from "../src/latest";
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

async function asura() {
  return seedSource(handle.db, { key: "site:asura", trackingEnabled: true }, ["asuracomic.net"]);
}

describe("seriesToWatch (SPEC §7.11)", () => {
  it("lists series being read on enabled sites, with their page on the current domain", async () => {
    const source = await seedSource(handle.db, { key: "site:asura", trackingEnabled: true }, ["asuracomic.net", "asurascans.com"]);
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200 });
    await seedLink(handle.db, {
      workId: work.id,
      sourceId: source.id,
      externalKey: "solo-leveling",
      externalTitle: "Solo Leveling",
      seriesUrl: "https://asuracomic.net/series/solo-leveling",
    });

    expect(await seriesToWatch(handle.db)).toEqual([
      { sourceKey: "site:asura", externalKey: "solo-leveling", seriesUrl: "https://asurascans.com/series/solo-leveling", chapter: 200 },
    ]);
  });

  it("leaves out finished works, unknown positions, links without a page, disabled sites and services", async () => {
    const source = await asura();
    const disabled = await seedSource(handle.db, { key: "site:old", trackingEnabled: false }, ["old.example"]);
    const netflix = await seedSource(handle.db, { key: "netflix", kind: "streaming" });
    const link = async (title: string, values: Parameters<typeof seedWork>[1], sourceId = source.id, seriesUrl: string | null = `https://asuracomic.net/series/${title}`) => {
      const work = await seedWork(handle.db, { ...values, title });
      await seedLink(handle.db, { workId: work.id, sourceId, externalKey: title, externalTitle: title, ...(seriesUrl === null ? {} : { seriesUrl }) });
    };
    await link("completed", { title: "", chapter: 10, status: "completed" });
    await link("unknown", { title: "" });
    await link("no-page", { title: "", chapter: 10 }, source.id, null);
    await link("disabled", { title: "", chapter: 10 }, disabled.id, "https://old.example/series/disabled");
    await link("dark", { title: "", type: "series", season: 1, episode: 2 }, netflix.id, "https://www.netflix.com/title/1");

    expect(await seriesToWatch(handle.db)).toEqual([]);
  });
});

describe("recordLatestChapters", () => {
  it("stores the newest chapter at the linked work and ignores unknown series", async () => {
    const source = await asura();
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200 });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "solo-leveling", externalTitle: "Solo Leveling" });

    const updated = await recordLatestChapters(
      handle.db,
      [
        { sourceKey: "site:asura", externalKey: "solo-leveling", latestChapter: 203 },
        { sourceKey: "site:asura", externalKey: "unknown", latestChapter: 5 },
        { sourceKey: "site:nope", externalKey: "solo-leveling", latestChapter: 5 },
      ],
      NOW,
    );

    expect(updated).toBe(1);
    const [stored] = await handle.db.select().from(works).where(eq(works.id, work.id));
    expect(stored).toMatchObject({ latestChapter: 203, latestChapterAt: NOW, chapter: 200 });
  });

  it("takes the value the page shows now, also when it is lower", async () => {
    const source = await asura();
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200, latestChapter: 210 });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "solo-leveling", externalTitle: "Solo Leveling" });

    await recordLatestChapters(handle.db, [{ sourceKey: "site:asura", externalKey: "solo-leveling", latestChapter: 205 }], NOW);

    const [stored] = await handle.db.select().from(works).where(eq(works.id, work.id));
    expect(stored?.latestChapter).toBe(205);
  });
});
