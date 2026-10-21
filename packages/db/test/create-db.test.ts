import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../src/index";

const created: string[] = [];

afterEach(async () => {
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("createDb", () => {
  it("creates missing parent directories for a file-based PGlite database", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rwt-db-"));
    created.push(root);

    const handle = await createDb(`pglite:${path.join(root, "nested", "dev")}`);
    await handle.close();

    expect(handle.driver).toBe("pglite");
  });

  it("rejects unsupported URLs", async () => {
    await expect(createDb("mysql://localhost/db")).rejects.toThrow(/pglite: or postgres/);
  });
});
