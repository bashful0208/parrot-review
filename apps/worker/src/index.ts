import { pathToFileURL } from "node:url";

import {
  assertRedisReachable,
  buildWorkerConfig,
  createPlaceholderWorker,
  formatConfigError,
  validateWorkerEnv,
  createLogger,
  ensureErrorLogged,
} from "@reviewer/core";

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

  const { connection, worker } = createPlaceholderWorker(config, logger);

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
