import { createDb } from "@rwt/db";
import { DatabaseInUseError } from "@rwt/db/local";
import { migrateDb } from "@rwt/db/migrate";
import { ImportFormatError, importReadingList, parseReadingList } from "@rwt/server/excel-import";
import ExcelJS from "exceljs";

// Usage: pnpm import:excel "<Pfad zur Reading List.xlsx>" [--dry-run] (DATABASE_URL from apps/web/.env.local)
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const file = args.find((arg) => !arg.startsWith("--"));
const url = process.env.DATABASE_URL;

if (!file || !url) {
  console.error('Aufruf: pnpm import:excel "<Pfad>.xlsx" [--dry-run] (DATABASE_URL aus apps/web/.env.local)');
  process.exit(1);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(file);

let parsed: ReturnType<typeof parseReadingList>;
try {
  parsed = parseReadingList(workbook);
} catch (error) {
  if (error instanceof ImportFormatError) {
    console.error(`Abbruch: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

const handle = await createDb(url).catch((error: unknown) => {
  if (!(error instanceof DatabaseInUseError)) throw error;
  console.error(`Abbruch: ${error.message}`);
  process.exit(1);
});
try {
  if (handle.driver === "pglite") await migrateDb(handle);
  const report = await importReadingList(handle.db, parsed.rows, { dryRun });
  const total = report.withChapter + report.unknownChapter;

  if (dryRun) console.log("Trockenlauf – es wurde nichts gespeichert.\n");
  console.log(
    `Werke in der Datei: ${total} (Manga ${report.byType.manga}, Manhwa ${report.byType.manhwa}, Manhua ${report.byType.manhua})`,
  );
  console.log(
    `  mit Kapitel: ${report.withChapter} · Stand unbekannt: ${report.unknownChapter} · abgeschlossen: ${report.completed}`,
  );
  console.log(`Neu angelegt: ${report.created} · aktualisiert: ${report.updated} · unverändert: ${report.unchanged}`);
  console.log(`Übersprungene Zeilen: ${parsed.issues.length}`);
  for (const issue of parsed.issues) console.log(`  ${issue.sheet}, Zeile ${issue.rowNumber}: ${issue.message}`);
} finally {
  await handle.close();
}
