import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  driver: "pglite" | "postgres";
  /** Embedded database with a data directory only: its files as a gzipped tarball (backups). */
  dumpDataDir?: () => Promise<Blob>;
  close(): Promise<void>;
}

/**
 * `pglite:<dir>` → embedded Postgres in a local folder (the tracker itself; `~/` is the home
 * folder), `pglite:memory` → in memory (tests); `postgres://…` → node-postgres (own server later).
 * Same schema and migrations. Drivers are imported lazily so a Postgres setup never loads the
 * PGlite WASM. `loadDataDir` fills a new data directory from a backup.
 */
export async function createDb(url: string, options: { loadDataDir?: Blob } = {}): Promise<DbHandle> {
  if (url.startsWith("pglite:")) {
    const [{ PGlite }, { pg_trgm }, { drizzle }, local] = await Promise.all([
      import("@electric-sql/pglite"),
      import("@electric-sql/pglite/contrib/pg_trgm"),
      import("drizzle-orm/pglite"),
      import("./local"),
    ]);
    const dataDir = local.pgliteDataDir(url);
    let release = async () => {};
    if (dataDir) {
      // PGlite creates the data directory itself, but not missing parents such as `.data/`.
      const [{ mkdir }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
      await mkdir(path.dirname(dataDir), { recursive: true });
      release = await local.lockDataDir(dataDir);
    }
    // Options-object form: with `undefined` as first argument PGlite would drop the extensions.
    const client = await PGlite.create({
      dataDir: dataDir ?? "memory://",
      extensions: { pg_trgm },
      loadDataDir: options.loadDataDir,
    }).catch(async (error: unknown) => {
      await release();
      throw error;
    });
    return {
      db: drizzle({ client, schema }),
      driver: "pglite",
      ...(dataDir ? { dumpDataDir: () => client.dumpDataDir("gzip") } : {}),
      close: async () => {
        await client.close();
        await release();
      },
    };
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
