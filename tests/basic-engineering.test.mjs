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
    ".env.example",
  ];

  for (const relativePath of expectedPackages) {
    await access(path.join(rootDir, relativePath));
  }
});

test("worker dev script uses tsx watch subcommand syntax", async () => {
  const workerPackageJson = JSON.parse(
    await readText("apps/worker/package.json")
  );

  assert.equal(
    workerPackageJson.scripts.dev,
    "tsx watch --tsconfig tsconfig.dev.json src/index.ts"
  );
});

test("worker env validation keeps database/webhook requirements but drops default model env", async () => {
  const { validateWebEnv, validateWorkerEnv } = await import(
    "../packages/core/src/config/runtime.ts"
  );

  const workerEnv = validateWorkerEnv({
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/reviewer",
    WEBHOOK_SECRET: "secret",
  });

  assert.equal(
    workerEnv.database.url,
    "postgresql://postgres:postgres@127.0.0.1:5432/reviewer"
  );
  assert.equal(workerEnv.redis.url, "redis://127.0.0.1:6379");
  assert.equal(workerEnv.redis.queueName, "review-jobs");

  assert.throws(() => validateWorkerEnv({}), (error) => {
    return (
      error instanceof Error &&
      /\[worker\][\s\S]*Missing:/.test(error.message) &&
      /DATABASE_URL/.test(error.message) &&
      /WEBHOOK_SECRET/.test(error.message) &&
      !/DEFAULT_MODEL_PROVIDER/.test(error.message) &&
      !/DEFAULT_MODEL_NAME/.test(error.message)
    );
  });

  assert.throws(() => validateWebEnv({}), (error) => {
    return (
      error instanceof Error &&
      /\[web\][\s\S]*Missing:/.test(error.message) &&
      /DATABASE_URL/.test(error.message) &&
      /DEFAULT_MODEL_PROVIDER/.test(error.message) &&
      /DEFAULT_MODEL_NAME/.test(error.message)
    );
  });
});

test("core config schema applies defaults and reports missing keys clearly", async () => {
  const { validateAiEnv, validateWebEnv, validateWorkerEnv } = await import(
    "../packages/core/src/config/runtime.ts"
  );
  const { loadServerEnv, formatConfigError } = await import(
    "../packages/core/src/config/server.ts"
  );

  const env = loadServerEnv({
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/reviewer",
    WEBHOOK_SECRET: "secret",
    DEFAULT_MODEL_PROVIDER: "anthropic",
    DEFAULT_MODEL_NAME: "claude-3-7-sonnet",
  });

  assert.equal(
    env.database.url,
    "postgresql://postgres:postgres@127.0.0.1:5432/reviewer"
  );
  assert.equal(env.defaultModel.provider, "anthropic");
  assert.equal(env.ids.requestIdHeader, "x-request-id");
  assert.equal(env.redis.url, "redis://127.0.0.1:6379");
  assert.equal(env.redis.queueName, "review-jobs");

  const blankDefaults = loadServerEnv({
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/reviewer",
    REDIS_URL: "   ",
    REVIEW_QUEUE_NAME: "   ",
    WEBHOOK_SECRET: "secret",
    DEFAULT_MODEL_PROVIDER: "anthropic",
    DEFAULT_MODEL_NAME: "claude-3-7-sonnet",
  });

  assert.equal(blankDefaults.redis.url, "redis://127.0.0.1:6379");
  assert.equal(blankDefaults.redis.queueName, "review-jobs");

  assert.throws(
    () =>
      loadServerEnv({
        DATABASE_URL: "   ",
        DEFAULT_MODEL_PROVIDER: "anthropic",
      }),
    (error) => {
      const message = formatConfigError(error);
      return (
        /Missing:/.test(message) &&
        /DATABASE_URL/.test(message) &&
        /WEBHOOK_SECRET/.test(message)
      );
    }
  );

  assert.throws(
    () =>
      loadServerEnv({
        DATABASE_URL: "https://example.com/reviewer",
        WEBHOOK_SECRET: "secret",
        DEFAULT_MODEL_PROVIDER: "anthropic",
        DEFAULT_MODEL_NAME: "claude-3-7-sonnet",
      }),
    (error) => /Invalid:[\s\S]*DATABASE_URL/.test(formatConfigError(error))
  );

  assert.throws(() => validateWebEnv({}), /\[web\][\s\S]*Missing:/);
  assert.throws(() => validateWorkerEnv({}), (error) => {
    return (
      error instanceof Error &&
      /\[worker\][\s\S]*Missing:/.test(error.message) &&
      /DATABASE_URL/.test(error.message) &&
      /WEBHOOK_SECRET/.test(error.message) &&
      !/DEFAULT_MODEL_PROVIDER/.test(error.message) &&
      !/DEFAULT_MODEL_NAME/.test(error.message)
    );
  });
  assert.throws(() => validateAiEnv({}), /\[ai\][\s\S]*Missing:/);
});

test("ai package exposes provider config entry", async () => {
  const { loadAiProviderConfig, SUPPORTED_MODEL_PROVIDERS } = await import(
    "../packages/ai/src/config.ts"
  );

  const config = loadAiProviderConfig({
    DEFAULT_MODEL_PROVIDER: "anthropic",
    DEFAULT_MODEL_NAME: "claude-3-7-sonnet",
  });

  assert.deepEqual(SUPPORTED_MODEL_PROVIDERS, [
    "anthropic",
    "openai",
    "openrouter",
  ]);
  assert.equal(config.provider, "anthropic");
  assert.equal(config.model, "claude-3-7-sonnet");
  assert.throws(() => loadAiProviderConfig({}), /DEFAULT_MODEL_PROVIDER/);
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
