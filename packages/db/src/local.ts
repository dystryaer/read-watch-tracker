import { rmSync } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/** `~/…` → the home folder, so the web app (cwd `apps/web`) and the CLI (repo root) agree; else relative to cwd. */
export function resolveLocalPath(location: string): string {
  const home = location === "~" || location.startsWith("~/") || location.startsWith("~\\");
  return path.resolve(home ? path.join(homedir(), location.slice(1)) : location);
}

/** Data directory of a `pglite:` URL, or null for an in-memory database. */
export function pgliteDataDir(url: string): string | null {
  const location = url.slice("pglite:".length);
  return location === "" || location === "memory" ? null : resolveLocalPath(location);
}

export class DatabaseInUseError extends Error {
  constructor(dataDir: string, pid: number) {
    super(
      `Die Datenbank ${dataDir} ist schon geöffnet (Prozess ${pid}), z. B. vom laufenden Tracker. ` +
        `Diesen beenden und erneut versuchen. Läuft sicher nichts mehr: die Datei ${dataDir}.lock löschen.`,
    );
    this.name = "DatabaseInUseError";
  }
}

/**
 * PGlite has no lock of its own, and two processes writing one data directory corrupt it
 * (the tracker next to `pnpm import:excel`, or `pnpm dev` next to `pnpm start`). The lock file
 * beside the directory names its process; a lock whose process has ended is taken over.
 */
export async function lockDataDir(dataDir: string): Promise<() => Promise<void>> {
  const lockFile = `${dataDir}.lock`;
  for (;;) {
    try {
      const file = await open(lockFile, "wx");
      await file.writeFile(String(process.pid));
      await file.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = Number(await readFile(lockFile, "utf8").catch(() => ""));
      if (isRunning(owner)) throw new DatabaseInUseError(dataDir, owner);
      await rm(lockFile, { force: true });
    }
  }

  // The web app never closes its handle; Next.js ends with process.exit() on Ctrl+C.
  const releaseOnExit = () => rmSync(lockFile, { force: true });
  process.once("exit", releaseOnExit);
  return async () => {
    process.off("exit", releaseOnExit);
    await rm(lockFile, { force: true });
  };
}

function isRunning(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
