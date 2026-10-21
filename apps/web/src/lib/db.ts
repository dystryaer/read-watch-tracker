import "server-only";
import path from "node:path";
import { createDb, type Db, type DbHandle } from "@rwt/db";
import { migrateDb } from "@rwt/db/migrate";

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
  // The embedded database (local dev, E2E) migrates itself; Postgres uses `pnpm db:migrate`.
  if (handle.driver === "pglite") {
    await migrateDb(handle, process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/migrations"));
  }
  return handle;
}
