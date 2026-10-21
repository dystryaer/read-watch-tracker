import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { DbHandle } from "./index";
import type * as schema from "./schema";

// Computed on demand: inside a bundler (Next.js) import.meta.url may not be a file URL.
export function defaultMigrationsFolder(): string {
  return fileURLToPath(new URL("../migrations", import.meta.url));
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
