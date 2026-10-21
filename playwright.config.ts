import { defineConfig } from "@playwright/test";

const WEB_PORT = 3210;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "web", testDir: "tests/e2e/web", use: { baseURL: WEB_URL } },
    { name: "extension", testDir: "tests/e2e/extension" },
  ],
  // Production build on a fresh embedded database for every run.
  webServer: {
    command: [
      `node -e "require('fs').rmSync('apps/web/.data/e2e', { recursive: true, force: true })"`,
      "pnpm --filter @rwt/web build",
      `pnpm --filter @rwt/web exec next start -H 127.0.0.1 -p ${WEB_PORT}`,
    ].join(" && "),
    url: `${WEB_URL}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: "pglite:./.data/e2e",
      BETTER_AUTH_SECRET: "e2e-only-secret-e2e-only-secret-e2e",
      BETTER_AUTH_URL: WEB_URL,
      SETUP_TOKEN: "e2e-setup-token-0123456789",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
