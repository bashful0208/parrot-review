import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

import { buildWorkerConfig } from "./index.js";

const workerDir = "/Users/bashful/work/code/reviewer/apps/worker";

test("buildWorkerConfig returns queue name and default redis url", () => {
  const config = buildWorkerConfig({});

  assert.equal(config.queueName, "review-jobs");
  assert.equal(config.connection.host, "127.0.0.1");
  assert.equal(config.connection.port, 6379);
});

test("buildWorkerConfig reads queue name from environment", () => {
  const config = buildWorkerConfig({ REVIEW_QUEUE_NAME: "custom-review-queue" });

  assert.equal(config.queueName, "custom-review-queue");
});

test("buildWorkerConfig reads redis host and port from REDIS_URL", () => {
  const config = buildWorkerConfig({ REDIS_URL: "redis://cache.internal:6381" });

  assert.equal(config.connection.host, "cache.internal");
  assert.equal(config.connection.port, 6381);
});

test(
  "worker process fails fast when Redis is unreachable",
  { timeout: 15_000 },
  async () => {
    const workerEntry = path.join(workerDir, "src", "index.ts");
    const child = spawn("pnpm", ["exec", "tsx", workerEntry], {
      cwd: workerDir,
      env: {
        ...process.env,
        REDIS_URL: "redis://127.0.0.1:6399",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stderrChunks: string[] = [];
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(String(chunk));
    });

    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error("worker did not fail fast when Redis was unreachable"));
        }, 5000);

        child.once("exit", (code, signal) => {
          clearTimeout(timeout);
          resolve({ code, signal });
        });
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      },
    );

    assert.equal(result.signal, null);
    assert.notEqual(result.code, 0);
    assert.match(stderrChunks.join(""), /bootstrap failed|ECONNREFUSED|connect/i);
  },
);
