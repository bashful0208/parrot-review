import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..");

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

test("root package exposes unified engineering scripts", async () => {
  const packageJson = JSON.parse(await readText("package.json"));

  assert.equal(packageJson.scripts.lint, "pnpm -r run lint");
  assert.equal(packageJson.scripts.typecheck, "pnpm -r run typecheck");
  assert.equal(packageJson.scripts.format, "prettier --write .");
  assert.equal(packageJson.scripts["format:check"], "prettier --check .");
  assert.equal(
    packageJson.scripts.check,
    "pnpm lint && pnpm typecheck && pnpm test"
  );
});

test("workspace package stubs exist for P0 foundation", async () => {
  const expectedPackages = [
    "packages/ai/package.json",
    "packages/core/package.json",
    "packages/git/package.json",
    "packages/db-types/package.json",
  ];

  for (const relativePath of expectedPackages) {
    await access(path.join(rootDir, relativePath));
  }
});

test("core env helpers normalize required P0 settings", async () => {
  const { loadRuntimeEnv } = await import("../packages/core/src/env.ts");

  const env = loadRuntimeEnv({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    REDIS_URL: "redis://127.0.0.1:6379",
    WEBHOOK_SECRET: "secret",
    DEFAULT_MODEL_PROVIDER: "anthropic",
    DEFAULT_MODEL_NAME: "claude-3-7-sonnet",
  });

  assert.equal(env.defaultModel.provider, "anthropic");
  assert.equal(env.ids.requestIdHeader, "x-request-id");
  assert.equal(env.redis.queueName, "review-jobs");
});

test("core error catalog exposes stable codes", async () => {
  const { AppError, ErrorCode } =
    await import("../packages/core/src/errors.ts");
  const error = new AppError(ErrorCode.ModelInvocation, "model failed");

  assert.equal(error.code, "MODEL_INVOCATION_ERROR");
  assert.equal(error.category, "model");
});

test("core logger attaches standard context fields", async () => {
  const { createLogger } = await import("../packages/core/src/logging.ts");
  const entry = createLogger({ requestId: "req-1", taskId: "task-1" }).info(
    "worker ready"
  );

  assert.equal(entry.level, "info");
  assert.equal(entry.message, "worker ready");
  assert.equal(entry.request_id, "req-1");
  assert.equal(entry.task_id, "task-1");
});

test("core queue helpers expose shared runtime defaults", async () => {
  const { DEFAULT_QUEUE_NAME, DEFAULT_REDIS_URL, buildWorkerConfig } =
    await import("../packages/core/src/review-queue.ts");

  const config = buildWorkerConfig({ REVIEW_QUEUE_NAME: "priority-reviews" });

  assert.equal(DEFAULT_QUEUE_NAME, "review-jobs");
  assert.equal(DEFAULT_REDIS_URL, "redis://127.0.0.1:6379");
  assert.equal(config.queueName, "priority-reviews");
  assert.equal(config.redisUrl, "redis://127.0.0.1:6379");
});
