import { type DbHandle, events, sourceDomains, sources } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addSiteDomain,
  getSite,
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
    await seedSource(handle.db, { key: "site:asura", name: "Asura" }, ["asuracomic.net"]);
    expect((await getSite(handle.db, "site:asura"))?.name).toBe("Asura");
    expect(await getSite(handle.db, "site:missing")).toBeNull();
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

    expect(result).toEqual({ ok: true });
    const [stored] = await handle.db.select().from(sources).where(eq(sources.id, source.id));
    expect(stored).toMatchObject({
      ruleChapterPattern: String.raw`/chapter/(\d+)`,
      ruleTitleSelector: null,
      ruleNextUrlTemplate: "{seriesUrl}/chapter/{next}",
      ruleUpdatedAt: NOW,
    });
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
