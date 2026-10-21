import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/node_modules/**", "**/coverage/**", "**/dist/**", "**/.next/**", "**/next-env.d.ts", "**/.output/**", "**/.wxt/**"] },
  js.configs.recommended,
  tseslint.configs.strict,
);
