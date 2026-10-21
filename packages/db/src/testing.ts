import { sql } from "drizzle-orm";
import { createDb, type Db, type DbHandle } from "./index";
import { migrateDb } from "./migrate";

/** Fresh in-memory Postgres (PGlite) with all migrations applied. */
export async function createTestDb(): Promise<DbHandle> {
  const handle = await createDb("pglite:memory");
  await migrateDb(handle);
  return handle;
}

/** Empties every application table, so one database can serve a whole test file. */
export async function resetDb(db: Db): Promise<void> {
  await db.execute(sql`
    TRUNCATE events, pending_matches, work_links, works, source_domains, sources,
      pairing_codes, devices, auth_session, auth_account, auth_verification, auth_user
      RESTART IDENTITY CASCADE
  `);
}
