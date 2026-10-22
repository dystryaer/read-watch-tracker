import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { backupDirFor, dailyBackup, restoreBackup, writeBackup } from "../src/backup";
import { createDb, type DbHandle, works } from "../src/index";
import { DatabaseInUseError } from "../src/local";
import { migrateDb } from "../src/migrate";

const created: string[] = [];
const open: DbHandle[] = [];

afterEach(async () => {
  for (const handle of open.splice(0)) await handle.close();
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "rwt-backup-"));
  created.push(root);
  return root;
}

async function openDb(url: string): Promise<DbHandle> {
  const handle = await createDb(url);
  open.push(handle);
  return handle;
}

async function closeDb(handle: DbHandle): Promise<void> {
  open.splice(open.indexOf(handle), 1);
  await handle.close();
}

async function titles(url: string): Promise<string[]> {
  const handle = await openDb(url);
  const rows = await handle.db.select({ title: works.title }).from(works);
  await closeDb(handle);
  return rows.map((row) => row.title);
}

/** A migrated database with one work, its backup, and the work renamed afterwards. */
async function databaseWithBackup() {
  const root = await tempRoot();
  const url = `pglite:${path.join(root, "db")}`;
  const handle = await openDb(url);
  await migrateDb(handle);
  await handle.db.insert(works).values({ type: "manhwa", title: "Solo Leveling", titleNormalized: "solo leveling" });
  const file = await writeBackup(handle, path.join(root, "backups"));
  await handle.db.update(works).set({ title: "Renamed" }).where(eq(works.title, "Solo Leveling"));
  await closeDb(handle);
  return { root, url, file };
}

describe("backupDirFor", () => {
  it("uses BACKUP_DIR, with ~/ in the home folder", () => {
    expect(backupDirFor("/data/db", "~/tracker-backups")).toMatch(/tracker-backups$/);
  });

  it("falls back to a backups folder next to the data directory", () => {
    expect(backupDirFor(path.join("/data", "db"), undefined)).toBe(path.join("/data", "backups"));
  });
});

describe("writeBackup", () => {
  it("writes dated backups and keeps only the newest ones", async () => {
    const root = await tempRoot();
    const dir = path.join(root, "backups");
    await mkdir(dir);
    await writeFile(path.join(dir, "notes.txt"), "mine");
    const handle = await openDb(`pglite:${path.join(root, "db")}`);

    for (const day of [1, 2, 3]) await writeBackup(handle, dir, { keep: 2, now: new Date(2026, 9, day, 8, 0, 0) });

    expect((await readdir(dir)).sort()).toEqual([
      "notes.txt",
      "tracker-2026-10-02_08-00-00.tar.gz",
      "tracker-2026-10-03_08-00-00.tar.gz",
    ]);
  });

  it("needs an embedded database with a data directory", async () => {
    const handle = await openDb("pglite:memory");
    await expect(writeBackup(handle, await tempRoot())).rejects.toThrow(/Datenordner/);
  });
});

describe("dailyBackup", () => {
  it("writes at most one backup per day", async () => {
    const root = await tempRoot();
    const dir = path.join(root, "backups");
    const handle = await openDb(`pglite:${path.join(root, "db")}`);

    expect(await dailyBackup(handle, dir, { now: new Date(2026, 9, 1, 8, 0, 0) })).not.toBeNull();
    expect(await dailyBackup(handle, dir, { now: new Date(2026, 9, 1, 20, 0, 0) })).toBeNull();
    expect(await dailyBackup(handle, dir, { now: new Date(2026, 9, 2, 8, 0, 0) })).not.toBeNull();
    expect(await readdir(dir)).toHaveLength(2);
  });
});

describe("restoreBackup", () => {
  it("brings back the data of a backup and keeps the replaced directory", async () => {
    const { url, file } = await databaseWithBackup();

    const { previous } = await restoreBackup(url, file);

    expect(await titles(url)).toEqual(["Solo Leveling"]);
    expect(previous).not.toBeNull();
    expect(await titles(`pglite:${previous}`)).toEqual(["Renamed"]);
  });

  it("refuses while the database is open", async () => {
    const { url, file } = await databaseWithBackup();
    await openDb(url);

    await expect(restoreBackup(url, file)).rejects.toThrow(DatabaseInUseError);
  });

  it("puts the old directory back when the backup cannot be loaded", async () => {
    const { root, url } = await databaseWithBackup();
    const broken = path.join(root, "broken.tar.gz");
    await writeFile(broken, "not a backup");

    await expect(restoreBackup(url, broken)).rejects.toThrow();

    expect(await titles(url)).toEqual(["Renamed"]);
    expect((await readdir(root)).filter((name) => name.startsWith("db."))).toEqual([]);
  });

  it("changes nothing when the backup file is missing", async () => {
    const { root, url } = await databaseWithBackup();

    await expect(restoreBackup(url, path.join(root, "missing.tar.gz"))).rejects.toThrow();

    expect(existsSync(path.join(root, "db"))).toBe(true);
    expect(await titles(url)).toEqual(["Renamed"]);
  });
});
