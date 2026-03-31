import type { RuntimeEnv, WorkerRuntimeEnv } from "./server.js";

const runtimeExtension = import.meta.url.endsWith(".ts") ? "ts" : "js";

const { formatConfigError } = (await import(
  new URL(`./errors.${runtimeExtension}`, import.meta.url).href
)) as typeof import("./errors.js");
const { loadServerEnv, loadWorkerEnv } = (await import(
  new URL(`./server.${runtimeExtension}`, import.meta.url).href
)) as typeof import("./server.js");

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
