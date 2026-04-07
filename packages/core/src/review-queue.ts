import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";

import {
  DEFAULT_QUEUE_NAME,
  DEFAULT_REDIS_URL,
  queueEnvSchema,
} from "./config/schema.ts";
import type { QueueEnvInput } from "./config/schema.ts";
import { createLogger } from "./logging.ts";
import type { Logger } from "./logging.ts";
import { mapTaskTimeoutError } from "./errors/mappers.ts";
import { ensureErrorLogged } from "./errors/handler.ts";

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
  job: Job,
  logger?: Logger
): Promise<PlaceholderJobResult> {
  const jobLogger = logger || createLogger({ component: 'worker', taskId: String(job.id) });
  jobLogger.info('Received placeholder job', {
    job_name: job.name,
    job_id: job.id,
  });

  return {
    handledAt: new Date().toISOString(),
    placeholder: true,
  };
}

export function createPlaceholderWorker({
  queueName,
  redisUrl,
}: Pick<WorkerConfig, "queueName" | "redisUrl">, logger?: Logger): {
  connection: Redis;
  worker: Worker;
} {
  const workerLogger = logger || createLogger({ component: 'worker' });
  const connection = createRedisConnection(redisUrl);
  const worker = new Worker(queueName, (job: Job) => runPlaceholderJob(job, workerLogger), { connection });

  worker.on("completed", (job) => {
    if (job) {
      const jobLogger = workerLogger.child({ taskId: String(job.id) });
      jobLogger.info('Job completed', {
        job_name: job.name,
        job_id: job.id,
      });
    }
  });
  worker.on("failed", (job, error) => {
    const jobId = job?.id || 'unknown';
    const jobName = job?.name || 'unknown';
    const jobLogger = workerLogger.child({ taskId: jobId });
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

  return { connection, worker };
}

export async function enqueueReviewJob(
  env: Partial<QueueEnv> = process.env
): Promise<EnqueuedReviewJob> {
  const logger = createLogger({ component: 'queue' });
  const config = buildWorkerConfig(env);
  const connection = createRedisConnection(config.redisUrl);

  connection.on("error", (error) => {
    logger.error('Redis connection error', error, {
      resource: 'redis',
      operation: 'enqueue_review_job',
    });
  });

  const queue = new Queue(config.queueName, { connection });

  try {
    const job = await queue.add(DEFAULT_JOB_NAME, { source: "web" });

    logger.info('Review job enqueued successfully', {
      job_id: String(job.id),
      job_name: job.name,
      queue: config.queueName,
    });

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

export const DEFAULT_WEBHOOK_JOB_NAME = "webhook-review";

export interface WebhookJobPayload {
  source: "webhook";
  webhookEventId: string;
  repositoryId: string;
  organizationId: string;
  provider: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
}

export async function enqueueWebhookJob(
  payload: WebhookJobPayload,
  env: Partial<QueueEnv> = process.env
): Promise<EnqueuedReviewJob> {
  const logger = createLogger({ component: "queue" });
  const config = buildWorkerConfig(env);
  const connection = createRedisConnection(config.redisUrl);

  connection.on("error", (error) => {
    logger.error("Redis connection error", error, {
      resource: "redis",
      operation: "enqueue_webhook_job",
    });
  });

  const queue = new Queue(config.queueName, { connection });

  try {
    const job = await queue.add(DEFAULT_WEBHOOK_JOB_NAME, payload);

    logger.info("Webhook review job enqueued", {
      job_id: String(job.id),
      job_name: job.name,
      queue: config.queueName,
      repository_id: payload.repositoryId,
      pr_number: payload.prNumber,
    });

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
