import { type DbHandle, sourceDomains, sources } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildDeviceConfig, enableSource, ServiceDomainError, SourceConflictError, SourceNotFoundError } from "../src/sources";
import { seedSource } from "./helpers";

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

async function domainsOf(sourceId: string) {
  return handle.db.select().from(sourceDomains).where(eq(sourceDomains.sourceId, sourceId));
}

describe("enableSource", () => {
  it("creates a website source for a new origin", async () => {
    const result = await enableSource(handle.db, { origin: "https://www.asuracomic.net/" });

    expect(result).toEqual({ sourceKey: "site:asuracomic-net", name: "asuracomic.net", domains: ["asuracomic.net"] });
    const [source] = await handle.db.select().from(sources);
    expect(source).toMatchObject({ kind: "website", trackingEnabled: true });
  });

  it("uses a given name", async () => {
    expect((await enableSource(handle.db, { origin: "https://asuracomic.net/", name: "Asura" })).name).toBe("Asura");
  });

  it("returns the existing source for a known domain and turns tracking on", async () => {
    const existing = await seedSource(handle.db, { key: "site:asura", trackingEnabled: false }, ["asuracomic.net"]);

    const result = await enableSource(handle.db, { origin: "https://asuracomic.net/" });

    expect(result.sourceKey).toBe("site:asura");
    const [source] = await handle.db.select().from(sources).where(eq(sources.id, existing.id));
    expect(source?.trackingEnabled).toBe(true);
  });

  it("adds a moved domain to the existing source and makes it current", async () => {
    const existing = await seedSource(handle.db, { key: "site:asura" }, ["asuracomic.net"]);

    const result = await enableSource(handle.db, { origin: "https://asurascans.com/", moveFromSourceKey: "site:asura" });

    expect(result).toMatchObject({ sourceKey: "site:asura", domains: ["asuracomic.net", "asurascans.com"] });
    const domains = await domainsOf(existing.id);
    expect(domains.find((d) => d.isCurrent)?.domain).toBe("asurascans.com");
  });

  it.each([["https://www.netflix.com/"], ["https://www.amazon.de/"], ["https://read.amazon.com/"]])(
    "refuses to turn the service domain %s into a website source",
    async (origin) => {
      await expect(enableSource(handle.db, { origin })).rejects.toThrow(ServiceDomainError);
      expect(await handle.db.select().from(sources)).toHaveLength(0);
    },
  );

  it("refuses to move a website source onto a service domain", async () => {
    await seedSource(handle.db, { key: "site:asura" }, ["asuracomic.net"]);
    await expect(enableSource(handle.db, { origin: "https://www.netflix.com/", moveFromSourceKey: "site:asura" })).rejects.toThrow(
      ServiceDomainError,
    );
  });

  it("refuses to move to an unknown source", async () => {
    await expect(
      enableSource(handle.db, { origin: "https://asurascans.com/", moveFromSourceKey: "site:missing" }),
    ).rejects.toThrow(SourceNotFoundError);
  });

  it("refuses to move a domain that belongs to another source", async () => {
    await seedSource(handle.db, { key: "site:a" }, ["a.example"]);
    await seedSource(handle.db, { key: "site:b" }, ["b.example"]);

    await expect(enableSource(handle.db, { origin: "https://a.example/", moveFromSourceKey: "site:b" })).rejects.toThrow(
      SourceConflictError,
    );
  });

  it("does not create two sources with the same key", async () => {
    await seedSource(handle.db, { key: "site:asuracomic-net" });

    const result = await enableSource(handle.db, { origin: "https://asuracomic.net/" });

    expect(result.sourceKey).toBe("site:asuracomic-net-2");
  });
});

describe("buildDeviceConfig", () => {
  it("lists enabled websites with all domains and rules", async () => {
    await seedSource(
      handle.db,
      { key: "site:asura", ruleChapterPattern: String.raw`/chapter/(\d+)`, ruleNextUrlTemplate: "{seriesUrl}/chapter/{next}" },
      ["asuracomic.net", "asurascans.com"],
    );

    const config = await buildDeviceConfig(handle.db);

    expect(config.sites).toEqual([
      {
        sourceKey: "site:asura",
        domains: ["asuracomic.net", "asurascans.com"],
        chapterPattern: String.raw`/chapter/(\d+)`,
        nextUrlTemplate: "{seriesUrl}/chapter/{next}",
      },
    ]);
    expect(config.thresholds).toEqual({ scrollDepthPercent: 60, watchedPercent: 85 });
  });

  it("leaves out disabled sites, streaming services and sites without domains", async () => {
    await seedSource(handle.db, { key: "site:off", trackingEnabled: false }, ["off.example"]);
    await seedSource(handle.db, { key: "crunchyroll", kind: "streaming" }, ["crunchyroll.com"]);
    await seedSource(handle.db, { key: "site:nodomain" });

    expect((await buildDeviceConfig(handle.db)).sites).toEqual([]);
  });

  it("skips a stored rule that is no longer valid instead of failing the whole config", async () => {
    await seedSource(handle.db, { key: "site:broken", ruleChapterPattern: "(unclosed" }, ["broken.example"]);
    await seedSource(handle.db, { key: "site:ok" }, ["ok.example"]);

    const config = await buildDeviceConfig(handle.db);

    expect(config.sites.map((site) => site.sourceKey)).toEqual(["site:ok"]);
  });
});
