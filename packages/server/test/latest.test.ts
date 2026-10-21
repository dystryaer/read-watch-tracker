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

describe("seriesToWatch – one page per work", () => {
  it("watches only the site I read the work on last, so two sites cannot fight over the badge", async () => {
    const asura = await seedSource(handle.db, { key: "site:asura", trackingEnabled: true }, ["asuracomic.net"]);
    const slow = await seedSource(handle.db, { key: "site:slow", trackingEnabled: true }, ["slow.example"]);
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200, lastSourceId: asura.id });
    await seedLink(handle.db, { workId: work.id, sourceId: slow.id, externalKey: "solo", externalTitle: "Solo", seriesUrl: "https://slow.example/solo" });
    await seedLink(handle.db, {
      workId: work.id,
      sourceId: asura.id,
      externalKey: "solo-leveling",
      externalTitle: "Solo Leveling",
      seriesUrl: "https://asuracomic.net/series/solo-leveling",
    });

    expect((await seriesToWatch(handle.db)).map((series) => series.sourceKey)).toEqual(["site:asura"]);
  });

  it("still watches one page when the last source is no enabled website", async () => {
    const asura = await asura_();
    const slow = await seedSource(handle.db, { key: "site:slow", trackingEnabled: true }, ["slow.example"]);
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200 });
    for (const [source, key] of [[asura, "solo-leveling"], [slow, "solo"]] as const) {
      await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: key, externalTitle: key, seriesUrl: `https://${source.key === "site:slow" ? "slow.example" : "asuracomic.net"}/${key}` });
    }

    expect(await seriesToWatch(handle.db)).toHaveLength(1);
  });

  it("lists recently read works first and never-active ones last", async () => {
    const source = await asura_();
    for (const [title, lastProgressAt] of [["never", null], ["old", new Date("2026-01-01T00:00:00Z")], ["recent", new Date("2026-10-20T00:00:00Z")]] as const) {
      const work = await seedWork(handle.db, { title, chapter: 1, lastProgressAt });
      await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: title, externalTitle: title, seriesUrl: `https://asuracomic.net/series/${title}` });
    }

    expect((await seriesToWatch(handle.db)).map((series) => series.externalKey)).toEqual(["recent", "old", "never"]);
  });

  async function asura_() {
    return seedSource(handle.db, { key: "site:asura", trackingEnabled: true }, ["asuracomic.net"]);
  }
});

describe("recordLatestChapters", () => {
  it("stores the newest chapter at the linked work and ignores unknown series", async () => {
    const source = await asura();
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200 });
    await seedLink(handle.db, {
      workId: work.id,
      sourceId: source.id,
      externalKey: "solo-leveling",
      externalTitle: "Solo Leveling",
      seriesUrl: "https://asuracomic.net/series/solo-leveling",
    });

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

  it("only writes to works being read through an enabled website, whatever a stolen token sends", async () => {
    const source = await asura();
    const kindle = await seedSource(handle.db, { key: "kindle", kind: "app" });
    const done = await seedWork(handle.db, { title: "Done", chapter: 200, status: "completed" });
    const book = await seedWork(handle.db, { title: "Book", type: "ebook", percent: 40 });
    await seedLink(handle.db, { workId: done.id, sourceId: source.id, externalKey: "done", externalTitle: "Done", seriesUrl: "https://asuracomic.net/series/done" });
    await seedLink(handle.db, { workId: book.id, sourceId: kindle.id, externalKey: "B08FHBV4ZX", externalTitle: "Book" });

    const updated = await recordLatestChapters(
      handle.db,
      [
        { sourceKey: "site:asura", externalKey: "done", latestChapter: 99999 },
        { sourceKey: "kindle", externalKey: "B08FHBV4ZX", latestChapter: 99999 },
      ],
      NOW,
    );

    expect(updated).toBe(0);
    expect((await handle.db.select().from(works)).map((work) => work.latestChapter)).toEqual([null, null]);
  });

  it("takes the value the page shows now, also when it is lower", async () => {
    const source = await asura();
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200, latestChapter: 210 });
    await seedLink(handle.db, {
      workId: work.id,
      sourceId: source.id,
      externalKey: "solo-leveling",
      externalTitle: "Solo Leveling",
      seriesUrl: "https://asuracomic.net/series/solo-leveling",
    });

    await recordLatestChapters(handle.db, [{ sourceKey: "site:asura", externalKey: "solo-leveling", latestChapter: 205 }], NOW);

    const [stored] = await handle.db.select().from(works).where(eq(works.id, work.id));
    expect(stored?.latestChapter).toBe(205);
  });
});
