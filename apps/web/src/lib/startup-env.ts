import { validateWebEnv } from "@reviewer/core";

export function ensureWebStartupEnv(
  env: NodeJS.ProcessEnv = process.env
): void {
  validateWebEnv(env);
}

ensureWebStartupEnv();
