import test from "node:test";
import assert from "node:assert/strict";

import { buildWorkerConfig } from "./index.js";

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
