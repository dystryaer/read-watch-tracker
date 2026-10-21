import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { DbHandle } from "./index";
import type * as schema from "./schema";

// Computed on demand and without the `new URL(…, import.meta.url)` pattern, which bundlers
// (Turbopack) try to resolve as an asset. The web app passes its folder explicitly.
export function defaultMigrationsFolder(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
}

export async function migrateDb(handle: DbHandle, migrationsFolder = defaultMigrationsFolder()): Promise<void> {
  if (handle.driver === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(handle.db as PgliteDatabase<typeof schema>, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(handle.db as NodePgDatabase<typeof schema>, { migrationsFolder });
  }
}
