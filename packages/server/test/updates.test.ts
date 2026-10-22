import type { DbHandle } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { countWorksWithNewChapters, lastSeriesCheck } from "../src/updates";
import { seedWork } from "./helpers";

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

describe("countWorksWithNewChapters (SPEC §4.9, navigation)", () => {
  it("is 0 without works", async () => {
    expect(await countWorksWithNewChapters(handle.db)).toBe(0);
  });

  it("counts works whose series page shows whole chapters beyond the one read, whatever their status", async () => {
    const counted = [
      { title: "Overgeared", chapter: 345, latestChapter: 348 },
      { title: "Tales of Demons and Gods", type: "manhua", chapter: 470.5, latestChapter: 472 },
      { title: "One Piece", type: "manga", chapter: 1130, latestChapter: 1131, status: "completed" },
      { title: "Nano Machine", chapter: 200, latestChapter: 230, status: "dropped" },
      { title: "Shadow Slave", type: "light_novel", chapter: 1204, latestChapter: 1210 },
    ] as const;
    const notCounted = [
      { title: "Half a chapter", chapter: 470.5, latestChapter: 470.9 },
      { title: "Up to date", chapter: 332, latestChapter: 332 },
      { title: "Page shows less", chapter: 51, latestChapter: 40 },
      { title: "Never checked", chapter: 95 },
      { title: "Unknown position", latestChapter: 12 },
    ] as const;
    for (const work of [...counted, ...notCounted]) await seedWork(handle.db, work);

    expect(await countWorksWithNewChapters(handle.db)).toBe(counted.length);
  });
});

describe("lastSeriesCheck", () => {
  it("is null while no series page was ever checked", async () => {
    await seedWork(handle.db, { title: "Overgeared", chapter: 345 });
    expect(await lastSeriesCheck(handle.db)).toBeNull();
  });

  it("is the newest time any series page was checked", async () => {
    await seedWork(handle.db, { title: "Old", chapter: 1, latestChapter: 1, latestChapterAt: new Date("2026-10-20T08:00:00Z") });
    await seedWork(handle.db, { title: "New", chapter: 1, latestChapter: 2, latestChapterAt: new Date("2026-10-22T06:30:00Z") });
    await seedWork(handle.db, { title: "Never", chapter: 1 });

    expect(await lastSeriesCheck(handle.db)).toEqual(new Date("2026-10-22T06:30:00Z"));
  });
});
