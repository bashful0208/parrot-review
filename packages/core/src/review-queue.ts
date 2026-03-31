import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";

import {
  DEFAULT_QUEUE_NAME,
  DEFAULT_REDIS_URL,
  queueEnvSchema,
} from "./config/schema.ts";
import type { QueueEnvInput } from "./config/schema.ts";

export { DEFAULT_QUEUE_NAME, DEFAULT_REDIS_URL } from "./config/schema.ts";
export const DEFAULT_JOB_NAME = "manual-review";

export type QueueEnv = NodeJS.ProcessEnv & Partial<QueueEnvInput>;

export type QueueConnectionConfig = {
  host: string;
  port: number;
};

export type WorkerConfig = {
  connection: QueueConnectionConfig;
  queueName: string;
  redisUrl: string;
};

export type EnqueuedReviewJob = {
  id: string;
  name: string;
  queue: string;
};

export type PlaceholderJobResult = {
  handledAt: string;
  placeholder: true;
};

export function buildWorkerConfig(
  env: Partial<QueueEnv> = process.env
): WorkerConfig {
  const parsed = queueEnvSchema.parse(env);
  const redisUrl = parsed.REDIS_URL;
  const queueName = parsed.REVIEW_QUEUE_NAME;
  const parsedRedisUrl = new URL(redisUrl);
  const port = parsedRedisUrl.port ? Number(parsedRedisUrl.port) : 6379;

  return {
    connection: {
      host: parsedRedisUrl.hostname || "127.0.0.1",
      port,
    },
    queueName,
    redisUrl,
  };
}

export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });
}

export async function assertRedisReachable(redisUrl: string): Promise<void> {
  const connection = new Redis(redisUrl, {
    enableReadyCheck: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });

  try {
    await connection.connect();
    await connection.ping();
  } finally {
    connection.disconnect();
  }
}

export async function runPlaceholderJob(
  job: Job
): Promise<PlaceholderJobResult> {
  console.log(
    `[worker] received placeholder job ${job.name} (${job.id ?? "no-id"})`
  );

  return {
    handledAt: new Date().toISOString(),
    placeholder: true,
  };
}

export function createPlaceholderWorker({
  queueName,
  redisUrl,
}: Pick<WorkerConfig, "queueName" | "redisUrl">): {
  connection: Redis;
  worker: Worker;
} {
  const connection = createRedisConnection(redisUrl);
  const worker = new Worker(queueName, runPlaceholderJob, { connection });

  worker.on("completed", (job) => {
    console.log(`[worker] completed job ${job.name} (${job.id ?? "no-id"})`);
  });
  worker.on("failed", (job, error) => {
    console.error(
      `[worker] failed job ${job?.name ?? "unknown"} (${job?.id ?? "no-id"}):`,
      error
    );
  });

  return { connection, worker };
}

export async function enqueueReviewJob(
  env: Partial<QueueEnv> = process.env
): Promise<EnqueuedReviewJob> {
  const config = buildWorkerConfig(env);
  const connection = createRedisConnection(config.redisUrl);
  connection.on("error", (error) => {
    console.error("[review-queue] redis connection error", error);
  });

  const queue = new Queue(config.queueName, { connection });

  try {
    const job = await queue.add(DEFAULT_JOB_NAME, { source: "web" });

    return {
      id: String(job.id ?? "no-id"),
      name: job.name,
      queue: config.queueName,
    };
  } finally {
    await queue.close();
    await connection.quit();
  }
}
