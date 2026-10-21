import { type DbHandle, events, pendingMatches, workLinks } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ignoreSeries } from "../src/ignore";
import { ingestEvents } from "../src/ingest";
import { SourceNotFoundError } from "../src/sources";
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

describe("ignoreSeries", () => {
  it("drops future events of the key", async () => {
    await seedSource(handle.db, { key: "site:asura" });

    await ignoreSeries(handle.db, { sourceKey: "site:asura", externalKey: "news-chapter-12", rawTitle: "News" }, NOW);
    const [result] = await ingestEvents(handle.db, null, [chapterEvent({ source: { externalKey: "news-chapter-12" } })], NOW);

    expect(result?.outcome).toBe("ignored");
  });

  it("resolves an open match and its waiting events", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    await ignoreSeries(handle.db, { sourceKey: "site:asura", externalKey: "overgeared", rawTitle: "Overgeared" }, NOW);

    const [match] = await handle.db.select().from(pendingMatches);
    expect(match).toMatchObject({ resolution: "ignored", resolvedAt: NOW });
    const [event] = await handle.db.select().from(events);
    expect(event?.outcome).toBe("ignored");
  });

  it("removes an existing link of the key, so it stops counting for that work", async () => {
    const source = await seedSource(handle.db, { key: "site:asura" });
    const work = await seedWork(handle.db, { title: "Overgeared" });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "overgeared", externalTitle: "Overgeared" });

    await ignoreSeries(handle.db, { sourceKey: "site:asura", externalKey: "overgeared", rawTitle: "Overgeared" }, NOW);
    const [result] = await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    expect(await handle.db.select().from(workLinks)).toHaveLength(0);
    expect(result?.outcome).toBe("ignored");
  });

  it("is idempotent", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    const input = { sourceKey: "site:asura", externalKey: "x", rawTitle: "X" };

    await ignoreSeries(handle.db, input, NOW);
    await ignoreSeries(handle.db, input, NOW);

    expect(await handle.db.select().from(pendingMatches)).toHaveLength(1);
  });

  it("refuses an unknown source", async () => {
    await expect(
      ignoreSeries(handle.db, { sourceKey: "site:missing", externalKey: "x", rawTitle: "X" }, NOW),
    ).rejects.toThrow(SourceNotFoundError);
  });
});
