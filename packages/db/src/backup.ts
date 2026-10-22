import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDb, type DbHandle } from "./index";
import { lockDataDir, pgliteDataDir, resolveLocalPath } from "./local";

const BACKUP_FILE = /^tracker-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.tar\.gz$/;

/** `BACKUP_DIR`, else a `backups` folder next to the data directory. */
export function backupDirFor(dataDir: string, configured = process.env.BACKUP_DIR): string {
  return configured ? resolveLocalPath(configured) : path.join(path.dirname(dataDir), "backups");
}

/**
 * Copy of the embedded database as `tracker-<local time>.tar.gz`. Older backups beyond `keep`
 * are removed; other files in the folder stay. Safe while the tracker runs (PGlite pauses queries).
 */
export async function writeBackup(
  handle: DbHandle,
  dir: string,
  { keep = 14, now = new Date() }: { keep?: number; now?: Date } = {},
): Promise<string> {
  if (!handle.dumpDataDir) throw new Error("Sichern geht nur bei der eingebetteten Datenbank mit Datenordner.");
  const file = path.join(dir, `tracker-${stamp(now)}.tar.gz`);
  const backup = Buffer.from(await (await handle.dumpDataDir()).arrayBuffer());
  await mkdir(dir, { recursive: true });
  // Written under another name first: a crash never leaves a truncated file that looks like a backup.
  await writeFile(`${file}.part`, backup, { flush: true });
  await rename(`${file}.part`, file);

  const backups = (await readdir(dir)).filter((name) => BACKUP_FILE.test(name)).sort();
  await Promise.all(backups.slice(0, -keep).map((name) => rm(path.join(dir, name))));
  return file;
}

/** Like writeBackup, unless one from the same (local) day exists. Returns the new file or null. */
export async function dailyBackup(
  handle: DbHandle,
  dir: string,
  options: { keep?: number; now?: Date } = {},
): Promise<string | null> {
  const now = options.now ?? new Date();
  const today = `tracker-${stamp(now).slice(0, 10)}_`;
  const existing = await readdir(dir).catch(() => [] as string[]);
  if (existing.some((name) => BACKUP_FILE.test(name) && name.startsWith(today))) return null;
  return writeBackup(handle, dir, { ...options, now });
}

/**
 * Replaces the data directory of a `pglite:` URL with a backup. The replaced directory stays
 * beside it (`<dir>.vor-<time>`), so a restore can be undone; if the backup cannot be loaded,
 * it is put back. Refuses while anything has the database open.
 */
export async function restoreBackup(
  url: string,
  file: string,
  now = new Date(),
): Promise<{ dataDir: string; previous: string | null }> {
  const dataDir = pgliteDataDir(url);
  if (!dataDir) throw new Error("Wiederherstellen geht nur bei der eingebetteten Datenbank mit Datenordner.");
  // Read first: a missing or unreadable file changes nothing.
  const backup = new Blob([await readFile(file)]);

  const release = await lockDataDir(dataDir);
  let previous: string | null = null;
  try {
    if (await exists(dataDir)) {
      previous = `${dataDir}.vor-${stamp(now)}`;
      await rename(dataDir, previous);
    }
  } finally {
    await release();
  }

  try {
    const handle = await createDb(url, { loadDataDir: backup });
    await handle.close();
  } catch (error) {
    await rm(dataDir, { recursive: true, force: true });
    if (previous) await rename(previous, dataDir);
    throw error;
  }
  return { dataDir, previous };
}

async function exists(dir: string): Promise<boolean> {
  return stat(dir).then(
    () => true,
    () => false,
  );
}

/** `2026-10-22_08-05-09` in local time: sorts by age, readable in the file list. */
function stamp(date: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${day}_${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`;
}
