import js from "@eslint/js";
import tseslint from "typescript-eslint";

const baseConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    rules: {
      "no-console": "warn",
    },
  },
];

export default baseConfig;
