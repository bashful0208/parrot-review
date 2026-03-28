import assert from "node:assert/strict";
import test from "node:test";

import { Queue, QueueEvents } from "bullmq";

import { createPlaceholderWorker, createRedisConnection } from "./index.js";

const TEST_REDIS_URL = process.env.REDIS_URL;

test(
  "placeholder worker consumes a queued job",
  { timeout: 15_000 },
  async (t) => {
    if (!TEST_REDIS_URL) {
      t.skip("REDIS_URL is required for the queue integration test");
      return;
    }

    const queueName = `review-jobs-integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const queueConnection = createRedisConnection(TEST_REDIS_URL);
    const queueEventsConnection = createRedisConnection(TEST_REDIS_URL);
    const { connection: workerConnection, worker } = createPlaceholderWorker({
      queueName,
      redisUrl: TEST_REDIS_URL,
    });
    const queue = new Queue(queueName, { connection: queueConnection });
    const queueEvents = new QueueEvents(queueName, { connection: queueEventsConnection });

    t.after(async () => {
      await worker.close();
      await queue.close();
      await queueEvents.close();
      await Promise.allSettled([
        workerConnection.quit(),
        queueConnection.quit(),
        queueEventsConnection.quit(),
      ]);
    });

    await queueEvents.waitUntilReady();
    await worker.waitUntilReady();

    const job = await queue.add("integration-proof", { source: "queue.integration.test.ts" });
    const result = await job.waitUntilFinished(queueEvents, 10_000);

    assert.equal(result.placeholder, true);
    assert.equal(typeof result.handledAt, "string");

    const jobCounts = await queue.getJobCounts("waiting", "active", "completed", "failed");

    assert.equal(jobCounts.failed, 0);
    assert.equal(jobCounts.completed, 1);

    await queue.obliterate({ force: true });

    const cleanedJobCounts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
    );

    assert.equal(cleanedJobCounts.waiting, 0);
    assert.equal(cleanedJobCounts.active, 0);
    assert.equal(cleanedJobCounts.completed, 0);
    assert.equal(cleanedJobCounts.failed, 0);
    assert.equal(cleanedJobCounts.delayed, 0);
    assert.equal(cleanedJobCounts.paused, 0);
  },
);
