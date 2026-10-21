import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "server",
    include: ["test/**/*.test.ts"],
    // Tests start real (embedded) Postgres instances, which is slow while all files run in parallel.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
