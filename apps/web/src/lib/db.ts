import "server-only";
import path from "node:path";
import { createDb, type Db, type DbHandle } from "@rwt/db";
import { dailyBackup } from "@rwt/db/backup";
import { resolveLocalPath } from "@rwt/db/local";
import { migrateDb } from "@rwt/db/migrate";

// How often a running tracker checks whether today's backup exists.
const BACKUP_CHECK_MS = 6 * 60 * 60 * 1000;

declare global {
  // Survives hot reloads in development, so only one PGlite instance opens the data directory.
  var rwtDbHandle: Promise<DbHandle> | undefined;
}

export async function getDb(): Promise<Db> {
  globalThis.rwtDbHandle ??= connect();
  return (await globalThis.rwtDbHandle).db;
}

async function connect(): Promise<DbHandle> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const handle = await createDb(url);
  // The embedded database (the tracker, E2E) migrates itself; Postgres uses `pnpm db:migrate`.
  if (handle.driver === "pglite") {
    // Before migrating, so an update that goes wrong can be undone with `pnpm db:restore`.
    await startDailyBackups(handle);
    await migrateDb(handle, process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/migrations"));
  }
  return handle;
}

/** With BACKUP_DIR set: one backup per day, at start and while the tracker keeps running. */
async function startDailyBackups(handle: DbHandle): Promise<void> {
  const dir = process.env.BACKUP_DIR;
  if (!dir || !handle.dumpDataDir) return;
  // A failed backup must not take the tracker down; it is retried at the next check.
  const backup = () =>
    dailyBackup(handle, resolveLocalPath(dir)).catch((error: unknown) => {
      console.error("Sicherung fehlgeschlagen:", error);
      return null;
    });
  await backup();
  setInterval(backup, BACKUP_CHECK_MS).unref();
}
