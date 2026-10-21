import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  driver: "pglite" | "postgres";
  close(): Promise<void>;
}

/**
 * `pglite:memory` or `pglite:<dir>` → embedded Postgres (local dev, tests);
 * `postgres://…` → node-postgres (Neon now, own server later). Same schema and migrations.
 * Drivers are imported lazily so production never loads the PGlite WASM.
 */
export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith("pglite:")) {
    const location = url.slice("pglite:".length);
    const [{ PGlite }, { pg_trgm }, { drizzle }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("@electric-sql/pglite/contrib/pg_trgm"),
      import("drizzle-orm/pglite"),
    ]);
    const inMemory = location === "" || location === "memory";
    if (!inMemory) {
      // PGlite creates the data directory itself, but not missing parents such as `.data/`.
      const [{ mkdir }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
      await mkdir(path.dirname(path.resolve(location)), { recursive: true });
    }
    // Options-object form: with `undefined` as first argument PGlite would drop the extensions.
    const client = await PGlite.create({
      dataDir: inMemory ? "memory://" : location,
      extensions: { pg_trgm },
    });
    return { db: drizzle({ client, schema }), driver: "pglite", close: () => client.close() };
  }

  if (/^postgres(?:ql)?:\/\//.test(url)) {
    const [{ default: pg }, { drizzle }] = await Promise.all([
      import("pg"),
      import("drizzle-orm/node-postgres"),
    ]);
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    return { db: drizzle({ client: pool, schema }), driver: "postgres", close: () => pool.end() };
  }

  throw new Error("DATABASE_URL must start with pglite: or postgres://");
}
