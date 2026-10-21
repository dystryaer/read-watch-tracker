import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    name: "web",
    include: ["test/**/*.test.ts"],
    // Auth tests start an embedded Postgres, which is slow while all files run in parallel.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
