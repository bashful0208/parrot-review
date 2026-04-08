import { pathToFileURL } from "node:url";

import { Worker } from "bullmq";

import {
  assertRedisReachable,
  buildWorkerConfig,
  createRedisConnection,
  formatConfigError,
  validateWorkerEnv,
  createLogger,
  ensureErrorLogged,
  mapTaskTimeoutError,
} from "@reviewer/core";
import { handleReviewJob } from "./handlers/review.js";

export { buildWorkerConfig } from "@reviewer/core";

export async function main(env = process.env): Promise<void> {
  const logger = createLogger({
    component: 'worker',
    service: 'reviewer-worker',
  });

  try {
    validateWorkerEnv(env);
  } catch (error) {
    ensureErrorLogged(error, logger, { scope: 'worker_bootstrap' });
    throw error;
  }

  const config = buildWorkerConfig(env);

  logger.info('Worker configuration loaded', {
    queue: config.queueName,
    redis_url: config.redisUrl.replace(/\/\/[^@]+@/, '//***@'),
  });

  await assertRedisReachable(config.redisUrl);

  const connection = createRedisConnection(config.redisUrl);
  const worker = new Worker(
    config.queueName,
    (job) => handleReviewJob(job, logger),
    {
      connection,
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    if (job) {
      const jobLogger = logger.child({ taskId: String(job.id) });
      jobLogger.info('Job completed', {
        job_name: job.name,
        job_id: job.id,
      });
    }
  });
  worker.on("failed", (job, error) => {
    const jobId = job?.id || 'unknown';
    const jobName = job?.name || 'unknown';
    const jobLogger = logger.child({ taskId: jobId });
    const appError = mapTaskTimeoutError(
      jobId,
      'exceeded',
      0,
      {
        operation: 'job_execution',
        task_id: jobId,
        job_name: jobName,
      }
    );

    jobLogger.error('Job failed', error, {
      job_name: jobName,
      job_id: jobId,
      error_code: appError.code,
    });

    ensureErrorLogged(appError, jobLogger);
  });

  await worker.waitUntilReady();
  logger.info('Worker started and waiting for jobs');

  const shutdown = async (signal: string) => {
    logger.info(`Shutting down on ${signal}`);
    await worker.close();
    await connection.quit();
    logger.info('Worker shutdown complete');
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await new Promise<void>(() => {});
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    const logger = createLogger({ component: 'worker' });
    ensureErrorLogged(error, logger, { scope: 'worker_bootstrap' });
    process.exitCode = 1;
  });
}
