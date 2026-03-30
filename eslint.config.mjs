import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export const baseIgnores = [
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.worktrees/**",
  "**/.claude/worktrees/**",
];

export const baseConfig = [
  {
    ignores: baseIgnores,
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];

export default baseConfig;
