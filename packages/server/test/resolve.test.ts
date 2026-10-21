import { type DbHandle, events, pendingMatches, workLinks, works } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ingestEvents } from "../src/ingest";
import { confirmMatches, PendingMatchNotFoundError, resolvePendingMatch } from "../src/resolve";
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

async function openMatch() {
  const [pending] = await handle.db.select().from(pendingMatches);
  if (!pending) throw new Error("no pending match");
  return pending;
}

async function workById(id: string) {
  const [work] = await handle.db.select().from(works).where(eq(works.id, id));
  return work;
}

describe("resolvePendingMatch – link", () => {
  it("links the key and replays waiting events in time order", async () => {
    await seedSource(handle.db, { key: "site:asura" }, ["asuracomic.net"]);
    const work = await seedWork(handle.db, { title: "Overgeared" });
    await ingestEvents(
      handle.db,
      null,
      [
        chapterEvent({ chapter: 2, occurredAt: "2026-10-21T18:10:00.000Z" }),
        chapterEvent({ chapter: 1, occurredAt: "2026-10-21T18:00:00.000Z" }),
      ],
      NOW,
    );
    const pending = await openMatch();

    const result = await resolvePendingMatch(handle.db, pending.id, { action: "link", workId: work.id }, NOW);

    expect(result).toEqual({ workId: work.id, applied: 2 });
    expect(await workById(work.id)).toMatchObject({
      chapter: 2,
      lastUrl: "https://asuracomic.net/series/overgeared/chapter/2",
    });
    const stored = await handle.db.select().from(events);
    expect(stored.every((e) => e.outcome === "applied" && e.workId === work.id)).toBe(true);
    expect(await openMatch()).toMatchObject({ resolution: "linked", resolvedAt: NOW });
  });

  it("keeps the forward-only rule when replaying", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    const work = await seedWork(handle.db, { title: "Overgeared", chapter: 10 });
    await ingestEvents(handle.db, null, [chapterEvent({ chapter: 5 })], NOW);

    const result = await resolvePendingMatch(handle.db, (await openMatch()).id, { action: "link", workId: work.id }, NOW);

    expect(result.applied).toBe(0);
    expect((await workById(work.id))?.chapter).toBe(10);
    const [stored] = await handle.db.select().from(events);
    expect(stored).toMatchObject({ outcome: "no_change", workId: work.id });
  });

  it("makes later events of the key apply without asking again", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    const work = await seedWork(handle.db, { title: "Overgeared" });
    await ingestEvents(handle.db, null, [chapterEvent({ chapter: 1 })], NOW);
    await resolvePendingMatch(handle.db, (await openMatch()).id, { action: "link", workId: work.id }, NOW);

    const [later] = await ingestEvents(handle.db, null, [chapterEvent({ chapter: 2 })], NOW);

    expect(later?.outcome).toBe("applied");
    expect(await handle.db.select().from(pendingMatches)).toHaveLength(1);
  });

  it("stores the source's title and series URL on the link", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    const work = await seedWork(handle.db, { title: "Overgeared" });
    await ingestEvents(
      handle.db,
      null,
      [chapterEvent({ source: { rawTitle: "Overgeared (Manhwa)", seriesUrl: "https://asuracomic.net/series/overgeared" } })],
      NOW,
    );

    await resolvePendingMatch(handle.db, (await openMatch()).id, { action: "link", workId: work.id }, NOW);

    const [link] = await handle.db.select().from(workLinks);
    expect(link).toMatchObject({
      externalKey: "overgeared",
      externalTitle: "Overgeared (Manhwa)",
      externalTitleNormalized: "overgeared",
      seriesUrl: "https://asuracomic.net/series/overgeared",
    });
  });

  it("refuses a work that does not exist", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    await expect(
      resolvePendingMatch(handle.db, (await openMatch()).id, { action: "link", workId: crypto.randomUUID() }, NOW),
    ).rejects.toThrow();
    expect((await openMatch()).resolvedAt).toBeNull();
  });
});

describe("resolvePendingMatch – new work", () => {
  it("creates the work from the source's title and applies the events", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    await ingestEvents(handle.db, null, [chapterEvent({ chapter: 7, source: { rawTitle: "Overgeared" } })], NOW);

    const { workId } = await resolvePendingMatch(handle.db, (await openMatch()).id, { action: "new_work", type: "manhwa" }, NOW);

    expect(workId).not.toBeNull();
    expect(await workById(workId ?? "")).toMatchObject({
      title: "Overgeared",
      titleNormalized: "overgeared",
      type: "manhwa",
      chapter: 7,
    });
    expect((await openMatch()).resolution).toBe("new_work");
  });

  it("uses a title given by the user", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    const { workId } = await resolvePendingMatch(
      handle.db,
      (await openMatch()).id,
      { action: "new_work", type: "manga", title: "Overgeared (Remake)" },
      NOW,
    );

    expect((await workById(workId ?? ""))?.title).toBe("Overgeared (Remake)");
  });
});

describe("resolvePendingMatch – ignore", () => {
  it("marks waiting events as ignored and drops future ones", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    await ingestEvents(handle.db, null, [chapterEvent()], NOW);

    const result = await resolvePendingMatch(handle.db, (await openMatch()).id, { action: "ignore" }, NOW);
    const [later] = await ingestEvents(handle.db, null, [chapterEvent({ chapter: 400 })], NOW);

    expect(result).toEqual({ workId: null, applied: 0 });
    expect(later?.outcome).toBe("ignored");
    const stored = await handle.db.select().from(events);
    expect(stored.map((e) => e.outcome)).toEqual(["ignored", "ignored"]);
  });
});

describe("resolvePendingMatch – errors", () => {
  it("throws for an unknown id", async () => {
    await expect(resolvePendingMatch(handle.db, crypto.randomUUID(), { action: "ignore" }, NOW)).rejects.toThrow(
      PendingMatchNotFoundError,
    );
  });

  it("throws for a match that is already resolved", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    await ingestEvents(handle.db, null, [chapterEvent()], NOW);
    const { id } = await openMatch();
    await resolvePendingMatch(handle.db, id, { action: "ignore" }, NOW);

    await expect(resolvePendingMatch(handle.db, id, { action: "ignore" }, NOW)).rejects.toThrow(
      PendingMatchNotFoundError,
    );
  });
});

describe("confirmMatches", () => {
  it("links only matches whose best candidate scores at least 0.9", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    const overgeared = await seedWork(handle.db, { title: "Overgeared" });
    await seedWork(handle.db, { title: "Solo Leveling Ragnarok" });
    await ingestEvents(
      handle.db,
      null,
      [
        chapterEvent({ chapter: 3 }),
        chapterEvent({ source: { externalKey: "solo-leveling", rawTitle: "Solo Leveling" } }),
      ],
      NOW,
    );
    const ids = (await handle.db.select().from(pendingMatches)).map((p) => p.id);

    const confirmed = await confirmMatches(handle.db, ids, NOW);

    expect(confirmed).toBe(1);
    expect((await workById(overgeared.id))?.chapter).toBe(3);
    const open = await handle.db.select().from(pendingMatches).where(eq(pendingMatches.externalKey, "solo-leveling"));
    expect(open[0]?.resolvedAt).toBeNull();
  });

  it("skips ids that are unknown or already resolved", async () => {
    expect(await confirmMatches(handle.db, [crypto.randomUUID()], NOW)).toBe(0);
  });
});
