import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/node_modules/**", "**/coverage/**", "**/dist/**", "**/.next/**", "**/next-env.d.ts", "**/.output/**", "**/.output-e2e/**", "**/.wxt/**", "**/test-results/**", "**/playwright-report/**"] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    // Auth is checked where the data is loaded, not only in a layout (Next.js renders segments
    // independently): pages and Server Actions get the database only through getAuthorizedDb().
    files: ["apps/web/src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "@/lib/db", message: "Use getAuthorizedDb() from @/lib/dal instead." }] },
      ],
    },
  },
);
