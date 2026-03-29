import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { pathToFileURL } from "node:url";

const DEFAULT_QUEUE_NAME = "review-jobs";
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

type WorkerEnv = Partial<
  Record<"REDIS_URL" | "REVIEW_QUEUE_NAME" | "WORKER_AUTOSTART", string>
>;

type PlaceholderWorkerOptions = Pick<WorkerConfig, "queueName" | "redisUrl">;

export type WorkerConfig = {
  autoStart: boolean;
  connection: {
    host: string;
    port: number;
  };
  queueName: string;
  redisUrl: string;
};

export type PlaceholderJobResult = {
  handledAt: string;
  placeholder: true;
};

export function buildWorkerConfig(env: WorkerEnv): WorkerConfig {
  const redisUrl = env.REDIS_URL?.trim() || DEFAULT_REDIS_URL;
  const queueName = env.REVIEW_QUEUE_NAME?.trim() || DEFAULT_QUEUE_NAME;
  const parsedRedisUrl = new URL(redisUrl);
  const port = parsedRedisUrl.port ? Number(parsedRedisUrl.port) : 6379;

  return {
    autoStart: env.WORKER_AUTOSTART === "true",
    connection: {
      host: parsedRedisUrl.hostname || "127.0.0.1",
      port,
    },
    queueName,
    redisUrl,
  };
}

export function createRedisConnection(redisUrl: string): Redis {
  const connection = new Redis(redisUrl, {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });

  connection.on("error", (error) => {
    console.error("[worker] redis connection error", error);
  });

  return connection;
}

export async function runPlaceholderJob(
  job: Job,
): Promise<PlaceholderJobResult> {
  console.log(`[worker] received placeholder job ${job.name} (${job.id ?? "no-id"})`);

  return {
    handledAt: new Date().toISOString(),
    placeholder: true,
  };
}

export function createPlaceholderWorker({
  queueName,
  redisUrl,
}: PlaceholderWorkerOptions): {
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
      error,
    );
  });

  return { connection, worker };
}

export async function main(env: WorkerEnv = process.env): Promise<void> {
  const config = buildWorkerConfig(env);

  console.log(`[worker] queue=${config.queueName}`);
  console.log(`[worker] redis=${config.redisUrl}`);

  // Default to a dry run so the scaffold can start locally before Redis exists.
  if (!config.autoStart) {
    console.log(
      "[worker] bootstrap ready; set WORKER_AUTOSTART=true to connect to Redis and consume jobs.",
    );
    return;
  }

  const { connection, worker } = createPlaceholderWorker(config);

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
