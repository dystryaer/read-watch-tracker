import { backupDirFor, restoreBackup, writeBackup } from "./backup";
import { createDb } from "./index";
import { DatabaseInUseError, pgliteDataDir } from "./local";

// Usage: pnpm db:backup · pnpm db:restore "<Sicherung>.tar.gz" (DATABASE_URL from apps/web/.env.local)
const [command, file] = process.argv.slice(2);
const url = process.env.DATABASE_URL ?? "";
const dataDir = url.startsWith("pglite:") ? pgliteDataDir(url) : null;

if (!dataDir) {
  console.error("DATABASE_URL muss auf die eingebettete Datenbank zeigen (pglite:<Ordner>).");
  process.exit(1);
}

try {
  if (command === "backup") {
    const handle = await createDb(url);
    try {
      console.log(`Sicherung: ${await writeBackup(handle, backupDirFor(dataDir))}`);
    } finally {
      await handle.close();
    }
  } else if (command === "restore" && file) {
    const { previous } = await restoreBackup(url, file);
    console.log(`Wiederhergestellt: ${dataDir}`);
    if (previous) console.log(`Der bisherige Stand liegt in ${previous}.`);
  } else {
    console.error('Aufruf: pnpm db:backup · pnpm db:restore "<Sicherung>.tar.gz"');
    process.exit(1);
  }
} catch (error) {
  if (!(error instanceof DatabaseInUseError)) throw error;
  console.error(`Abbruch: ${error.message}`);
  process.exit(1);
}
