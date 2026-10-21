import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      thresholds: {
        // SPEC §15.2: core is the CI-gated package
        "packages/core/src/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
