import { cleanText, MAX_TEXT_LENGTH, type MediaType, normalizeTitle, Position } from "@rwt/core";
import { type Db, works } from "@rwt/db";
import { and, eq } from "drizzle-orm";
import type ExcelJS from "exceljs";

/**
 * One-time import of the reading list (SPEC §10.1). Not exported from the package index, so the
 * web app never bundles exceljs.
 */

type ImportType = Extract<MediaType, "manga" | "manhwa" | "manhua">;

export interface ImportRow {
  sheet: string;
  rowNumber: number;
  type: ImportType;
  title: string;
  chapter: number | null;
  completed: boolean;
}

export interface ImportIssue {
  sheet: string;
  rowNumber: number;
  message: string;
}

export interface ImportReport {
  created: number;
  updated: number;
  unchanged: number;
  withChapter: number;
  unknownChapter: number;
  completed: number;
  byType: Record<ImportType, number>;
}

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFormatError";
  }
}

const SHEET_TYPES: Record<string, ImportType> = { manga: "manga", manhwa: "manhwa", manhua: "manhua" };
const Title = cleanText(MAX_TEXT_LENGTH);

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value !== null && typeof value === "object" && "result" in value) return value.result; // formula
  return value;
}

function parseChapter(raw: unknown): { ok: true; chapter: number | null } | { ok: false } {
  let chapter: number | null;
  if (raw === null || raw === undefined) {
    chapter = null;
  } else if (typeof raw === "number") {
    chapter = raw;
  } else if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") chapter = null;
    else if (/^\d+(?:[.,]\d+)?$/.test(text)) chapter = Number(text.replace(",", "."));
    else return { ok: false };
  } else {
    return { ok: false };
  }
  if (chapter === null) return { ok: true, chapter };
  return Position.safeParse({ unit: "chapter", chapter }).success ? { ok: true, chapter } : { ok: false };
}

/** Reads the sheets "Manga", "Manhwa" and "Manhua"; any other sheet aborts the import. */
export function parseReadingList(workbook: ExcelJS.Workbook): { rows: ImportRow[]; issues: ImportIssue[] } {
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];

  for (const sheet of workbook.worksheets) {
    const type = SHEET_TYPES[sheet.name.trim().toLowerCase()];
    if (!type) {
      throw new ImportFormatError(`Unbekanntes Tabellenblatt „${sheet.name}“ (erwartet: Manga, Manhwa, Manhua)`);
    }
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const rawTitle = row.getCell(1).text.trim();
      const chapterCell = cellValue(row.getCell(2));
      if (rawTitle === "") {
        if (chapterCell !== null && chapterCell !== undefined) {
          issues.push({ sheet: sheet.name, rowNumber, message: "Titel fehlt" });
        }
        return;
      }

      const title = Title.safeParse(rawTitle);
      if (!title.success) {
        issues.push({ sheet: sheet.name, rowNumber, message: `Titel ungültig (höchstens ${MAX_TEXT_LENGTH} Zeichen)` });
        return;
      }
      const chapter = parseChapter(chapterCell);
      if (!chapter.ok) {
        issues.push({ sheet: sheet.name, rowNumber, message: "Kapitel ist keine gültige Zahl (0 bis 99999.99)" });
        return;
      }
      const completed = /^complete(?:d)?$/i.test(row.getCell(3).text.trim());
      rows.push({ sheet: sheet.name, rowNumber, type, title: title.data, chapter: chapter.chapter, completed });
    });
  }
  return { rows, issues };
}

interface MergedRow {
  type: ImportType;
  title: string;
  titleNormalized: string;
  chapter: number | null;
  completed: boolean;
}

// The same work twice in the file: the higher chapter wins, "Complete" anywhere wins.
function mergeRows(rows: ImportRow[]): MergedRow[] {
  const merged = new Map<string, MergedRow>();
  for (const row of rows) {
    const titleNormalized = normalizeTitle(row.title);
    const key = `${row.type}\n${titleNormalized}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { type: row.type, title: row.title, titleNormalized, chapter: row.chapter, completed: row.completed });
      continue;
    }
    existing.chapter = maxChapter(existing.chapter, row.chapter);
    existing.completed ||= row.completed;
  }
  return [...merged.values()];
}

function maxChapter(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Idempotent: works are matched by type and normalized title; an existing work only ever gains
 * a higher chapter or the completed status. A dry run reads but never writes.
 */
export async function importReadingList(
  db: Db,
  rows: ImportRow[],
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  const merged = mergeRows(rows);
  const report: ImportReport = {
    created: 0,
    updated: 0,
    unchanged: 0,
    withChapter: merged.filter((row) => row.chapter !== null).length,
    unknownChapter: merged.filter((row) => row.chapter === null).length,
    completed: merged.filter((row) => row.completed).length,
    byType: { manga: 0, manhwa: 0, manhua: 0 },
  };
  for (const row of merged) report.byType[row.type]++;

  const apply = async (tx: Db) => {
    for (const row of merged) {
      const [existing] = await tx
        .select()
        .from(works)
        .where(and(eq(works.type, row.type), eq(works.titleNormalized, row.titleNormalized)))
        .limit(1);

      if (!existing) {
        report.created++;
        if (!dryRun) {
          await tx.insert(works).values({
            type: row.type,
            title: row.title,
            titleNormalized: row.titleNormalized,
            chapter: row.chapter,
            status: row.completed ? "completed" : "reading",
          });
        }
        continue;
      }

      const chapter = maxChapter(existing.chapter, row.chapter);
      const status = row.completed && existing.status !== "completed" ? "completed" : existing.status;
      if (chapter === existing.chapter && status === existing.status) {
        report.unchanged++;
        continue;
      }
      report.updated++;
      if (!dryRun) {
        await tx.update(works).set({ chapter, status, updatedAt: new Date() }).where(eq(works.id, existing.id));
      }
    }
  };

  if (dryRun) await apply(db);
  else await db.transaction(apply);
  return report;
}
