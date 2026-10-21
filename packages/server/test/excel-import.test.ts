import { type DbHandle, works } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ImportFormatError, importReadingList, parseReadingList } from "../src/excel-import";
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

type Cell = string | number | null;

async function workbook(sheets: Record<string, Cell[][]>): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(["Name", "Last Read Chapter"]);
    for (const row of rows) sheet.addRow(row);
  }
  // Round-trip through the file format, as the real list would be read.
  const reread = new ExcelJS.Workbook();
  await reread.xlsx.load(await book.xlsx.writeBuffer());
  return reread;
}

const readingList = () =>
  workbook({
    Manga: [["One Piece", 1172], ["The Reincarnated Inferior Magic Swordsman", null]],
    Manhwa: [
      ["Swordmaster’s Youngest Son", 216],
      ["Ranker’s Return", null],
      ["Solo Leveling", 200, "Complete"],
      ["I Obtained a Mythic Item", 98, "   "],
      [null, null],
      ["Warrior High School – Dungeon Raid Department", 105.5],
    ],
    Manhua: [["The Ancient Sovereign of Eternity", 163]],
  });

describe("parseReadingList", () => {
  it("reads title, chapter and completion per sheet", async () => {
    const { rows, issues } = parseReadingList(await readingList());

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ sheet: "Manga", rowNumber: 2, type: "manga", title: "One Piece", chapter: 1172, completed: false });
    expect(rows.find((r) => r.title === "Ranker’s Return")).toMatchObject({ type: "manhwa", chapter: null });
    expect(rows.find((r) => r.title === "Solo Leveling")).toMatchObject({ completed: true });
    expect(rows.find((r) => r.title === "I Obtained a Mythic Item")).toMatchObject({ completed: false });
    expect(rows.find((r) => r.title.startsWith("Warrior"))?.chapter).toBe(105.5);
  });

  it("keeps typographic apostrophes and dashes in the title", async () => {
    const { rows } = parseReadingList(await readingList());
    expect(rows.map((r) => r.title)).toContain("Warrior High School – Dungeon Raid Department");
  });

  it("accepts chapter numbers stored as text", async () => {
    const { rows } = parseReadingList(await workbook({ Manhwa: [["Overgeared", "344"]] }));
    expect(rows[0]?.chapter).toBe(344);
  });

  it("reports and skips rows with an invalid chapter", async () => {
    const { rows, issues } = parseReadingList(
      await workbook({ Manhwa: [["Overgeared", "abc"], ["Negative", -3], ["Too precise", 1.234], ["Fine", 1]] }),
    );

    expect(rows.map((r) => r.title)).toEqual(["Fine"]);
    expect(issues.map((i) => `${i.sheet}:${i.rowNumber}`)).toEqual(["Manhwa:2", "Manhwa:3", "Manhwa:4"]);
  });

  it("reports a title that is too long", async () => {
    const { rows, issues } = parseReadingList(await workbook({ Manhwa: [["x".repeat(301), 1]] }));
    expect(rows).toEqual([]);
    expect(issues).toHaveLength(1);
  });

  it("matches sheet names case-insensitively", async () => {
    const { rows } = parseReadingList(await workbook({ " manhwa ": [["Overgeared", 1]] }));
    expect(rows[0]?.type).toBe("manhwa");
  });

  it("aborts on an unknown sheet", async () => {
    await expect(async () => parseReadingList(await workbook({ Webtoons: [["X", 1]] }))).rejects.toThrow(
      ImportFormatError,
    );
  });
});

describe("importReadingList", () => {
  it("creates works and reports the numbers", async () => {
    const { rows } = parseReadingList(await readingList());

    const report = await importReadingList(handle.db, rows);

    expect(report).toMatchObject({
      created: 8,
      updated: 0,
      unchanged: 0,
      withChapter: 6,
      unknownChapter: 2,
      completed: 1,
      byType: { manga: 2, manhwa: 5, manhua: 1 },
    });
    const solo = (await handle.db.select().from(works)).find((w) => w.title === "Solo Leveling");
    expect(solo).toMatchObject({ status: "completed", chapter: 200, titleNormalized: "solo leveling", lastProgressAt: null });
  });

  it("changes nothing on a second run", async () => {
    const { rows } = parseReadingList(await readingList());
    await importReadingList(handle.db, rows);

    const second = await importReadingList(handle.db, rows);

    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 8 });
    expect(await handle.db.select().from(works)).toHaveLength(8);
  });

  it("matches existing works by type and normalized title, keeping the higher chapter", async () => {
    await seedWork(handle.db, { title: "Swordmaster's Youngest Son", chapter: 230 });
    await seedWork(handle.db, { title: "One Piece", type: "manga", chapter: 1000 });
    const { rows } = parseReadingList(await readingList());

    const report = await importReadingList(handle.db, rows);

    expect(report).toMatchObject({ created: 6, updated: 1, unchanged: 1 });
    const all = await handle.db.select().from(works);
    expect(all.find((w) => w.title === "Swordmaster's Youngest Son")?.chapter).toBe(230);
    expect(all.find((w) => w.title === "One Piece")?.chapter).toBe(1172);
  });

  it("does not touch the database in a dry run", async () => {
    const { rows } = parseReadingList(await readingList());

    const report = await importReadingList(handle.db, rows, { dryRun: true });

    expect(report.created).toBe(8);
    expect(await handle.db.select().from(works)).toHaveLength(0);
  });

  it("merges duplicate rows of the same work within the file", async () => {
    const { rows } = parseReadingList(await workbook({ Manhwa: [["Overgeared", 10], ["Overgeared", 12]] }));

    const report = await importReadingList(handle.db, rows);

    expect(report.created).toBe(1);
    expect((await handle.db.select().from(works))[0]?.chapter).toBe(12);
  });
});
