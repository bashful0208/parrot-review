import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
export const DEFAULT_QUEUE_NAME = "review-jobs";
export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
export const DEFAULT_JOB_NAME = "manual-review";
export function buildWorkerConfig(env = process.env) {
    const redisUrl = env.REDIS_URL?.trim() || DEFAULT_REDIS_URL;
    const queueName = env.REVIEW_QUEUE_NAME?.trim() || DEFAULT_QUEUE_NAME;
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
export function createRedisConnection(redisUrl) {
    return new Redis(redisUrl, {
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
    });
}
export async function assertRedisReachable(redisUrl) {
    const connection = new Redis(redisUrl, {
        enableReadyCheck: false,
        lazyConnect: true,
        maxRetriesPerRequest: 0,
    });
    try {
        await connection.connect();
        await connection.ping();
    }
    finally {
        connection.disconnect();
    }
}
export async function runPlaceholderJob(job) {
    console.log(`[worker] received placeholder job ${job.name} (${job.id ?? "no-id"})`);
    return {
        handledAt: new Date().toISOString(),
        placeholder: true,
    };
}
export function createPlaceholderWorker({ queueName, redisUrl, }) {
    const connection = createRedisConnection(redisUrl);
    const worker = new Worker(queueName, runPlaceholderJob, { connection });
    worker.on("completed", (job) => {
        console.log(`[worker] completed job ${job.name} (${job.id ?? "no-id"})`);
    });
    worker.on("failed", (job, error) => {
        console.error(`[worker] failed job ${job?.name ?? "unknown"} (${job?.id ?? "no-id"}):`, error);
    });
    return { connection, worker };
}
export async function enqueueReviewJob(env = process.env) {
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
    }
    finally {
        await queue.close();
        await connection.quit();
    }
}
