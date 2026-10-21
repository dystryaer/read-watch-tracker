import { type DbHandle, events, pendingMatches, sources } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDeviceWithToken } from "../src/devices";
import { confirmShare, ShareNotFoundError, ShareValueError, startShare } from "../src/share";
import { seedLink, seedSource, seedWork } from "./helpers";

let handle: DbHandle;
let phone: string;
const NOW = new Date("2026-10-21T20:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const SHADOW_SLAVE = "https://m.webnovel.com/book/22196546206090805";
const HAIL_MARY = "https://read.amazon.com/kp/kshare?asin=B08FHBV4ZX";

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  await resetDb(handle.db);
  phone = (await createDeviceWithToken(handle.db, { kind: "phone", name: "iPhone" }, NOW)).device.id;
});

async function linkedShadowSlave(chapter: number | null = 1204) {
  const source = await seedSource(handle.db, { key: "webnovel", kind: "app", defaultMediaType: "light_novel" });
  const work = await seedWork(handle.db, { title: "Shadow Slave", type: "light_novel", chapter });
  await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "22196546206090805", externalTitle: "Shadow Slave" });
  return work;
}

describe("startShare", () => {
  it("finds the linked WebNovel book and suggests the next chapter", async () => {
    await linkedShadowSlave(1204);

    const share = await startShare(handle.db, phone, { url: SHADOW_SLAVE }, NOW);

    expect(share).toEqual({
      shareId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: "Shadow Slave",
      unit: "chapter",
      current: 1204,
      suggested: 1205,
      needsMatch: false,
    });
  });

  it("finds the linked Kindle book and suggests the last percentage", async () => {
    const source = await seedSource(handle.db, { key: "kindle", kind: "app", defaultMediaType: "ebook" });
    const work = await seedWork(handle.db, { title: "Project Hail Mary", type: "ebook", percent: 43.5 });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "B08FHBV4ZX", externalTitle: "Project Hail Mary" });

    expect(await startShare(handle.db, phone, { url: HAIL_MARY }, NOW)).toMatchObject({
      title: "Project Hail Mary",
      unit: "percent",
      current: 43.5,
      suggested: 43.5,
      needsMatch: false,
    });
  });

  it("names an unknown book after the shared text, without a position", async () => {
    const share = await startShare(handle.db, phone, { text: "„Project Hail Mary“ von Andy Weir https://read.amazon.com/kp/kshare?asin=B08FHBV4ZX&id=x" }, NOW);

    expect(share).toMatchObject({ title: "Project Hail Mary von Andy Weir", unit: "percent", current: null, suggested: null, needsMatch: true });
    const [source] = await handle.db.select().from(sources).where(eq(sources.key, "kindle"));
    expect(source).toMatchObject({ kind: "app", defaultMediaType: "ebook" });
  });

  it("cleans the shared text like every other title: no control or bidi characters", async () => {
    const [nul, rlo] = [String.fromCharCode(0), String.fromCharCode(0x202e)];
    const share = await startShare(handle.db, phone, { text: `Shadow${nul}Slave${rlo} ${SHADOW_SLAVE}` }, NOW);
    expect(share?.title).toBe("Shadow Slave");

    const onlyControls = await startShare(handle.db, phone, { text: `${rlo}${nul} ${SHADOW_SLAVE}` }, NOW);
    expect(onlyControls?.title).toBe("WebNovel 22196546206090805");
  });

  it("falls back to the service and key when the share has no text", async () => {
    expect(await startShare(handle.db, phone, { url: SHADOW_SLAVE }, NOW)).toMatchObject({ title: "WebNovel 22196546206090805", needsMatch: true });
  });

  it("recognizes nothing in other links", async () => {
    expect(await startShare(handle.db, phone, { url: "https://www.example.com/book/1" }, NOW)).toBeNull();
  });
});

describe("confirmShare", () => {
  it("saves the chapter and says so", async () => {
    const work = await linkedShadowSlave(1204);
    const share = await startShare(handle.db, phone, { url: SHADOW_SLAVE }, NOW);

    const result = await confirmShare(handle.db, phone, { shareId: share?.shareId ?? "", chapter: 1205 }, minutes(1));

    expect(result).toEqual({ outcome: "applied", title: "Shadow Slave", message: "Shadow Slave → Kap. 1205 gespeichert" });
    const [event] = await handle.db.select().from(events);
    expect(event).toMatchObject({ deviceId: phone, workId: work.id, chapter: 1205, kind: "read" });
  });

  it("formats a percentage the German way", async () => {
    const source = await seedSource(handle.db, { key: "kindle", kind: "app", defaultMediaType: "ebook" });
    const work = await seedWork(handle.db, { title: "Project Hail Mary", type: "ebook", percent: 40 });
    await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: "B08FHBV4ZX", externalTitle: "Project Hail Mary" });
    const share = await startShare(handle.db, phone, { url: HAIL_MARY }, NOW);

    expect((await confirmShare(handle.db, phone, { shareId: share?.shareId ?? "", percent: 43.5 }, NOW)).message).toBe(
      "Project Hail Mary → 43,5 % gespeichert",
    );
  });

  it("says when nothing changed because the book is further already", async () => {
    await linkedShadowSlave(1210);
    const share = await startShare(handle.db, phone, { url: SHADOW_SLAVE }, NOW);

    expect(await confirmShare(handle.db, phone, { shareId: share?.shareId ?? "", chapter: 1205 }, NOW)).toEqual({
      outcome: "no_change",
      title: "Shadow Slave",
      message: "Shadow Slave steht schon weiter – nichts geändert",
    });
  });

  it("keeps the number of an unknown book at an inbox card", async () => {
    const share = await startShare(handle.db, phone, { text: "Shadow Slave https://m.webnovel.com/book/22196546206090805" }, NOW);

    const result = await confirmShare(handle.db, phone, { shareId: share?.shareId ?? "", chapter: 12 }, NOW);

    expect(result).toEqual({ outcome: "pending", title: "Shadow Slave", message: "Neuer Titel – bitte im Tracker zuordnen" });
    const [card] = await handle.db.select().from(pendingMatches);
    expect(card).toMatchObject({ externalKey: "22196546206090805", rawTitle: "Shadow Slave", eventCount: 1 });
  });

  it("uses a share only once", async () => {
    await linkedShadowSlave();
    const share = await startShare(handle.db, phone, { url: SHADOW_SLAVE }, NOW);
    await confirmShare(handle.db, phone, { shareId: share?.shareId ?? "", chapter: 1205 }, NOW);

    await expect(confirmShare(handle.db, phone, { shareId: share?.shareId ?? "", chapter: 1206 }, NOW)).rejects.toThrow(ShareNotFoundError);
  });

  it("refuses a share of another device, an expired one and an unknown id", async () => {
    await linkedShadowSlave();
    const share = await startShare(handle.db, phone, { url: SHADOW_SLAVE }, NOW);
    const other = (await createDeviceWithToken(handle.db, { kind: "phone", name: "iPad" }, NOW)).device.id;
    const shareId = share?.shareId ?? "";

    await expect(confirmShare(handle.db, other, { shareId, chapter: 1205 }, NOW)).rejects.toThrow(ShareNotFoundError);
    await expect(confirmShare(handle.db, phone, { shareId, chapter: 1205 }, minutes(16))).rejects.toThrow(ShareNotFoundError);
    await expect(confirmShare(handle.db, phone, { shareId: crypto.randomUUID(), chapter: 1205 }, NOW)).rejects.toThrow(ShareNotFoundError);
  });

  it("refuses a number the event schema would refuse, without using up the share", async () => {
    await linkedShadowSlave(1204);
    const share = await startShare(handle.db, phone, { url: SHADOW_SLAVE }, NOW);
    const shareId = share?.shareId ?? "";

    await expect(confirmShare(handle.db, phone, { shareId, chapter: 1.205 }, NOW)).rejects.toThrow(ShareValueError);
    expect((await confirmShare(handle.db, phone, { shareId, chapter: 1205 }, NOW)).outcome).toBe("applied");
  });

  it("refuses a percentage for a book counted in chapters", async () => {
    await linkedShadowSlave();
    const share = await startShare(handle.db, phone, { url: SHADOW_SLAVE }, NOW);

    await expect(confirmShare(handle.db, phone, { shareId: share?.shareId ?? "", percent: 50 }, NOW)).rejects.toThrow(ShareValueError);
  });
});
