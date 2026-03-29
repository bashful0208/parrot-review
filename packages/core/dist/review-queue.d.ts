import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
export declare const DEFAULT_QUEUE_NAME = "review-jobs";
export declare const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
export declare const DEFAULT_JOB_NAME = "manual-review";
export type QueueEnv = NodeJS.ProcessEnv & Partial<Record<"REDIS_URL" | "REVIEW_QUEUE_NAME", string>>;
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
export declare function buildWorkerConfig(env?: Partial<QueueEnv>): WorkerConfig;
export declare function createRedisConnection(redisUrl: string): Redis;
export declare function assertRedisReachable(redisUrl: string): Promise<void>;
export declare function runPlaceholderJob(job: Job): Promise<PlaceholderJobResult>;
export declare function createPlaceholderWorker({ queueName, redisUrl, }: Pick<WorkerConfig, "queueName" | "redisUrl">): {
    connection: Redis;
    worker: Worker;
};
export declare function enqueueReviewJob(env?: Partial<QueueEnv>): Promise<EnqueuedReviewJob>;
