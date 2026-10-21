import { type DbHandle, pendingMatches } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listOpenMatches } from "../src/inbox";
import { ingestEvents } from "../src/ingest";
import { chapterEvent, seedSource, seedWork } from "./helpers";

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

describe("listOpenMatches", () => {
  it("describes each open match with source, last seen position and resolved candidates", async () => {
    await seedSource(handle.db, { key: "site:asura", name: "Asura" });
    const imported = await seedWork(handle.db, { title: "Overgeared", chapter: 344 });
    await ingestEvents(
      handle.db,
      null,
      [
        chapterEvent({ chapter: 346, occurredAt: "2026-10-21T18:10:00.000Z" }),
        chapterEvent({ chapter: 345, occurredAt: "2026-10-21T18:00:00.000Z" }),
      ],
      NOW,
    );

    const [match] = await listOpenMatches(handle.db);

    expect(match).toMatchObject({
      rawTitle: "Overgeared",
      sourceName: "Asura",
      eventCount: 2,
      lastPosition: { chapter: 346 },
      suggestedType: "manhwa",
      candidates: [{ workId: imported.id, title: "Overgeared", type: "manhwa", score: 1, chapter: 344 }],
    });
  });

  it("suggests the media type from the event hint, then the source, then the unit", async () => {
    await seedSource(handle.db, { key: "crunchyroll", kind: "streaming", defaultMediaType: "anime" });
    await seedSource(handle.db, { key: "site:a" });
    await ingestEvents(
      handle.db,
      null,
      [
        chapterEvent({ mediaTypeHint: "manga", source: { key: "site:a", externalKey: "a", rawTitle: "A", url: undefined } }),
        chapterEvent({
          source: { key: "crunchyroll", externalKey: "frieren", rawTitle: "Frieren", url: undefined },
          position: { unit: "episode", season: 1, episode: 2 },
        }),
        chapterEvent({ source: { key: "site:a", externalKey: "b", rawTitle: "B", url: undefined } }),
      ],
      NOW,
    );

    const matches = await listOpenMatches(handle.db);
    const typeOf = (title: string) => matches.find((m) => m.rawTitle === title)?.suggestedType;

    expect(typeOf("A")).toBe("manga");
    expect(typeOf("Frieren")).toBe("anime");
    expect(typeOf("B")).toBe("manhwa");
  });

  it("drops candidates whose work no longer exists", async () => {
    const source = await seedSource(handle.db, { key: "site:a" });
    await handle.db.insert(pendingMatches).values({
      sourceId: source.id,
      externalKey: "k",
      rawTitle: "T",
      candidates: [{ workId: crypto.randomUUID(), score: 0.95 }],
    });

    const [match] = await listOpenMatches(handle.db);

    expect(match?.candidates).toEqual([]);
  });

  it("lists the most recently seen matches first and leaves out resolved ones", async () => {
    const source = await seedSource(handle.db, { key: "site:a" });
    await handle.db.insert(pendingMatches).values([
      { sourceId: source.id, externalKey: "old", rawTitle: "Old", lastSeenAt: new Date("2026-10-01T00:00:00Z") },
      { sourceId: source.id, externalKey: "new", rawTitle: "New", lastSeenAt: new Date("2026-10-20T00:00:00Z") },
      { sourceId: source.id, externalKey: "done", rawTitle: "Done", resolvedAt: NOW, resolution: "ignored" },
    ]);

    expect((await listOpenMatches(handle.db)).map((m) => m.rawTitle)).toEqual(["New", "Old"]);
  });
});
