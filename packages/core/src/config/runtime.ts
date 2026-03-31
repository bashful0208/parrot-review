import { formatConfigError } from "./errors.ts";
import { loadServerEnv, loadWorkerEnv } from "./server.ts";
import type { RuntimeEnv, WorkerRuntimeEnv } from "./server.ts";

export type AiRuntimeConfig = RuntimeEnv["defaultModel"];

function rethrowConfigError(scope: string, error: unknown): never {
  throw new Error(`[${scope}] ${formatConfigError(error)}`);
}

export function validateWebEnv(
  env: NodeJS.ProcessEnv = process.env
): RuntimeEnv {
  try {
    return loadServerEnv(env);
  } catch (error) {
    rethrowConfigError("web", error);
  }
}

export function validateWorkerEnv(
  env: NodeJS.ProcessEnv = process.env
): WorkerRuntimeEnv {
  try {
    return loadWorkerEnv(env);
  } catch (error) {
    rethrowConfigError("worker", error);
  }
}

export function validateAiEnv(
  env: NodeJS.ProcessEnv = process.env
): AiRuntimeConfig {
  try {
    return loadServerEnv(env).defaultModel;
  } catch (error) {
    rethrowConfigError("ai", error);
  }
}
