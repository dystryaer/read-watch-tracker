import "server-only";
import type { Db } from "@rwt/db";
import { requireSession } from "./auth";
import { getDb } from "./db";

/**
 * The only way pages and Server Actions reach the database: the session is checked right here, at
 * the data source. A layout check alone is not enough, because Next.js can render a page segment
 * without re-running its layout.
 */
export async function getAuthorizedDb(): Promise<Db> {
  await requireSession();
  return getDb();
}
