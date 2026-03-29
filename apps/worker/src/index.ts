import { pathToFileURL } from "node:url";

import {
  assertRedisReachable,
  buildWorkerConfig,
  createPlaceholderWorker,
} from "@reviewer/shared";

export { buildWorkerConfig } from "@reviewer/shared";

export async function main(env = process.env): Promise<void> {
  const config = buildWorkerConfig(env);

  console.log(`[worker] queue=${config.queueName}`);
  console.log(`[worker] redis=${config.redisUrl}`);

  await assertRedisReachable(config.redisUrl);

  const { connection, worker } = createPlaceholderWorker(config);

  await worker.waitUntilReady();
  console.log("[worker] worker started and waiting for jobs.");

  const shutdown = async (signal: string) => {
    console.log(`[worker] shutting down on ${signal}.`);
    await worker.close();
    await connection.quit();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await new Promise<void>(() => {});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error("[worker] bootstrap failed", error);
    process.exitCode = 1;
  });
}
