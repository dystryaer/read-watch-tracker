import { type DbHandle, events, sourceDomains, sources, workLinks } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addSiteDomain,
  getSite,
  getSiteId,
  listRecentSiteUrls,
  listSites,
  renameSite,
  setSiteTracking,
  SiteDomainError,
  updateSiteRule,
} from "../src/site-admin";
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

describe("listSites / getSite", () => {
  it("lists websites with domains, link count and rule, sorted by name", async () => {
    const asura = await seedSource(handle.db, { key: "site:asura", name: "Asura", ruleChapterPattern: String.raw`/chapter/(\d+)` }, [
      "asuracomic.net",
      "asurascans.com",
    ]);
    await seedSource(handle.db, { key: "site:b", name: "Beta", trackingEnabled: false }, ["b.example"]);
    await seedSource(handle.db, { key: "crunchyroll", name: "Crunchyroll", kind: "streaming" });
    const work = await seedWork(handle.db, { title: "Overgeared" });
    await seedLink(handle.db, { workId: work.id, sourceId: asura.id, externalKey: "k", externalTitle: "Overgeared" });

    const sites = await listSites(handle.db);

    expect(sites.map((s) => s.name)).toEqual(["Asura", "Beta"]);
    expect(sites[0]).toMatchObject({
      key: "site:asura",
      trackingEnabled: true,
      linkCount: 1,
      domains: [
        { domain: "asuracomic.net", isCurrent: false },
        { domain: "asurascans.com", isCurrent: true },
      ],
      rule: { chapterPattern: String.raw`/chapter/(\d+)` },
    });
  });

  it("finds a site by key", async () => {
    const source = await seedSource(handle.db, { key: "site:asura", name: "Asura" }, ["asuracomic.net"]);
    expect((await getSite(handle.db, "site:asura"))?.name).toBe("Asura");
    expect(await getSite(handle.db, "site:missing")).toBeNull();
    expect(await getSiteId(handle.db, "site:asura")).toBe(source.id);
    expect(await getSiteId(handle.db, "site:missing")).toBeNull();
  });
});

describe("updateSiteRule", () => {
  it("stores a valid rule and clears empty fields", async () => {
    const source = await seedSource(handle.db, { key: "site:asura", ruleTitleSelector: "h1" }, ["asuracomic.net"]);

    const result = await updateSiteRule(
      handle.db,
      source.id,
      { chapterPattern: String.raw`/chapter/(\d+)`, titleSelector: "", nextUrlTemplate: "{seriesUrl}/chapter/{next}" },
      NOW,
    );

    expect(result).toEqual({ ok: true, seriesPages: 0 });
    const [stored] = await handle.db.select().from(sources).where(eq(sources.id, source.id));
    expect(stored).toMatchObject({
      ruleChapterPattern: String.raw`/chapter/(\d+)`,
      ruleTitleSelector: null,
      ruleNextUrlTemplate: "{seriesUrl}/chapter/{next}",
      ruleUpdatedAt: NOW,
    });
  });

  it("stores the fields of the new-chapter check", async () => {
    const source = await seedSource(handle.db, { key: "site:scans" }, ["scans.example"]);

    await updateSiteRule(handle.db, source.id, { seriesUrlTemplate: "{origin}/manga/{series}", chapterLinkPattern: String.raw`[?&]chapter=(\d+)` }, NOW);

    const site = await getSite(handle.db, "site:scans");
    expect(site?.rule).toEqual({ seriesUrlTemplate: "{origin}/manga/{series}", chapterLinkPattern: String.raw`[?&]chapter=(\d+)` });
  });
});

describe("updateSiteRule – series pages follow the rule (SPEC §7.3)", () => {
  // Synthetic reader (A11): chapters under /title/<series>/…, the series page under /manga/<series>.
  async function readOnScans() {
    const source = await seedSource(handle.db, { key: "site:scans" }, ["scans.example"]);
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200 });
    const link = await seedLink(handle.db, {
      workId: work.id,
      sourceId: source.id,
      externalKey: "solo-leveling",
      externalTitle: "Solo Leveling",
      seriesUrl: "https://scans.example/title/Solo-Leveling",
    });
    const read = (url: string | null, minutesAgo: number, externalKey = "solo-leveling") => ({
      id: crypto.randomUUID(),
      kind: "read" as const,
      sourceId: source.id,
      externalKey,
      url,
      chapter: 200,
      occurredAt: new Date(NOW.getTime() - minutesAgo * 60_000),
      outcome: "applied" as const,
    });
    return { source, work, link, read };
  }
  const seriesUrlOf = async (id: string) => (await handle.db.select().from(workLinks).where(eq(workLinks.id, id)))[0]?.seriesUrl;

  it("derives each linked series page again from the newest chapter URL read there", async () => {
    const { source, link, read } = await readOnScans();
    await handle.db.insert(events).values([
      read("https://scans.example/title/Solo-Leveling/chapter/199/1", 60),
      read("https://scans.example/title/Solo-Leveling/chapter/200/1", 30),
      read(null, 10),
    ]);

    const result = await updateSiteRule(handle.db, source.id, { seriesUrlTemplate: "{origin}/manga/{series}" }, NOW);

    expect(result).toEqual({ ok: true, seriesPages: 1 });
    expect(await seriesUrlOf(link.id)).toBe("https://scans.example/manga/Solo-Leveling");
  });

  it("puts the path before the chapter back when the template is cleared", async () => {
    const { source, link, read } = await readOnScans();
    await handle.db.insert(events).values(read("https://scans.example/title/Solo-Leveling/chapter/200/1", 30));
    await updateSiteRule(handle.db, source.id, { seriesUrlTemplate: "{origin}/manga/{series}" }, NOW);

    await updateSiteRule(handle.db, source.id, {}, NOW);

    expect(await seriesUrlOf(link.id)).toBe("https://scans.example/title/Solo-Leveling");
  });

  it("keeps the page when the rule no longer finds this series in the newest URL", async () => {
    const { source, link, read } = await readOnScans();
    await handle.db.insert(events).values(read("https://scans.example/title/Solo-Leveling/chapter/200/1", 30));

    // A series pattern that yields another key, and a chapter pattern that matches no more.
    const otherKey = await updateSiteRule(
      handle.db,
      source.id,
      { seriesPattern: String.raw`/(title)/`, seriesUrlTemplate: "{origin}/manga/{series}" },
      NOW,
    );
    const noChapter = await updateSiteRule(handle.db, source.id, { chapterPattern: String.raw`/c(\d+)$`, seriesUrlTemplate: "{origin}/manga/{series}" }, NOW);

    expect([otherKey, noChapter]).toEqual([
      { ok: true, seriesPages: 0 },
      { ok: true, seriesPages: 0 },
    ]);
    expect(await seriesUrlOf(link.id)).toBe("https://scans.example/title/Solo-Leveling");
  });

  it("leaves the links of other sites alone", async () => {
    const { source, read } = await readOnScans();
    const other = await seedSource(handle.db, { key: "site:other" }, ["other.example"]);
    const work = await seedWork(handle.db, { title: "Eleceed", chapter: 5 });
    const otherLink = await seedLink(handle.db, {
      workId: work.id,
      sourceId: other.id,
      externalKey: "eleceed",
      externalTitle: "Eleceed",
      seriesUrl: "https://other.example/title/Eleceed",
    });
    await handle.db.insert(events).values({ ...read("https://other.example/title/Eleceed/chapter/5/1", 5, "eleceed"), sourceId: other.id });

    await updateSiteRule(handle.db, source.id, { seriesUrlTemplate: "{origin}/manga/{series}" }, NOW);

    expect(await seriesUrlOf(otherLink.id)).toBe("https://other.example/title/Eleceed");
  });

  it("reports invalid fields without saving anything", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" }, ["asuracomic.net"]);

    const result = await updateSiteRule(handle.db, source.id, { chapterPattern: "(unclosed", nextUrlTemplate: "javascript:{next}" }, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["chapterPattern", "nextUrlTemplate"]);
    const [stored] = await handle.db.select().from(sources).where(eq(sources.id, source.id));
    expect(stored?.ruleChapterPattern).toBeNull();
  });
});

describe("setSiteTracking / renameSite", () => {
  it("turns tracking off and renames", async () => {
    const source = await seedSource(handle.db, { key: "site:asura", name: "asuracomic.net" });

    await setSiteTracking(handle.db, source.id, false);
    await renameSite(handle.db, source.id, "Asura");

    const [stored] = await handle.db.select().from(sources).where(eq(sources.id, source.id));
    expect(stored).toMatchObject({ trackingEnabled: false, name: "Asura" });
  });
});

describe("addSiteDomain", () => {
  it("adds a domain and can make it current (domain move)", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" }, ["asuracomic.net"]);

    await addSiteDomain(handle.db, source.id, "WWW.AsuraScans.com", { makeCurrent: true });

    const domains = await handle.db.select().from(sourceDomains).where(eq(sourceDomains.sourceId, source.id));
    expect(domains.find((d) => d.isCurrent)?.domain).toBe("asurascans.com");
    expect(domains).toHaveLength(2);
  });

  it("adds an old domain without changing the current one", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" }, ["asurascans.com"]);

    await addSiteDomain(handle.db, source.id, "asuracomic.net", { makeCurrent: false });

    const domains = await handle.db.select().from(sourceDomains).where(eq(sourceDomains.sourceId, source.id));
    expect(domains.find((d) => d.isCurrent)?.domain).toBe("asurascans.com");
  });

  it("refuses a streaming service's domain", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    await expect(addSiteDomain(handle.db, source.id, "www.crunchyroll.com", { makeCurrent: true })).rejects.toThrow(SiteDomainError);
  });

  it("refuses an invalid host name", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    await expect(addSiteDomain(handle.db, source.id, "https://x.example/path", { makeCurrent: true })).rejects.toThrow(
      SiteDomainError,
    );
  });

  it("refuses a domain of another source", async () => {
    await seedSource(handle.db, { key: "site:a" }, ["a.example"]);
    const other = await seedSource(handle.db, { key: "site:b" }, ["b.example"]);
    await expect(addSiteDomain(handle.db, other.id, "a.example", { makeCurrent: true })).rejects.toThrow(SiteDomainError);
  });
});

describe("listRecentSiteUrls", () => {
  it("returns the newest distinct URLs of a site", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    const at = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
    await handle.db.insert(events).values([
      { id: crypto.randomUUID(), kind: "read", sourceId: source.id, url: "https://a.example/x/chapter-1", occurredAt: at(30), outcome: "pending" },
      { id: crypto.randomUUID(), kind: "read", sourceId: source.id, url: "https://a.example/x/chapter-2", occurredAt: at(20), outcome: "pending" },
      { id: crypto.randomUUID(), kind: "read", sourceId: source.id, url: "https://a.example/x/chapter-2", occurredAt: at(10), outcome: "pending" },
      { id: crypto.randomUUID(), kind: "read", sourceId: source.id, url: null, occurredAt: at(5), outcome: "pending" },
    ]);

    expect(await listRecentSiteUrls(handle.db, source.id)).toEqual(["https://a.example/x/chapter-2", "https://a.example/x/chapter-1"]);
  });
});

describe("getSite – rule problems", () => {
  it("names the problem of a stored rule the devices would skip", async () => {
    await seedSource(handle.db, { key: "site:old", ruleChapterPattern: String.raw`(?:-\d)*(\d+)` }, ["old.example"]);

    const site = await getSite(handle.db, "site:old");

    expect(site?.ruleProblem).toMatch(/nur mit \? optional/);
  });

  it("reports no problem for a valid or empty rule", async () => {
    await seedSource(handle.db, { key: "site:ok", ruleChapterPattern: String.raw`/c(\d+)` }, ["ok.example"]);
    await seedSource(handle.db, { key: "site:plain" }, ["plain.example"]);

    expect((await getSite(handle.db, "site:ok"))?.ruleProblem).toBeNull();
    expect((await getSite(handle.db, "site:plain"))?.ruleProblem).toBeNull();
  });
});
