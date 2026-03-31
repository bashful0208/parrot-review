import { z } from "zod";

export const DEFAULT_QUEUE_NAME = "review-jobs";
export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

const requiredString = z.string().trim().min(1);
const databaseUrl = requiredString.url().refine(
  (value) =>
    value.startsWith("postgres://") || value.startsWith("postgresql://"),
  {
    message:
      "DATABASE_URL must use a postgres:// or postgresql:// connection string",
  }
);
const defaultedString = (fallback: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      return value.trim() === "" ? undefined : value;
    },
    requiredString.default(fallback)
  );

export const defaultModelProviderSchema = z.enum([
  "anthropic",
  "openai",
  "openrouter",
]);

export const queueEnvSchema = z.object({
  REDIS_URL: defaultedString(DEFAULT_REDIS_URL),
  REVIEW_QUEUE_NAME: defaultedString(DEFAULT_QUEUE_NAME),
});

export const workerEnvSchema = z
  .object({
    DATABASE_URL: databaseUrl,
    WEBHOOK_SECRET: requiredString,
  })
  .extend(queueEnvSchema.shape);

export const serverEnvSchema = z
  .object({
    DATABASE_URL: databaseUrl,
    WEBHOOK_SECRET: requiredString,
    DEFAULT_MODEL_PROVIDER: defaultModelProviderSchema,
    DEFAULT_MODEL_NAME: requiredString,
  })
  .extend(queueEnvSchema.shape);

export type QueueEnvInput = z.input<typeof queueEnvSchema>;
export type QueueEnvSchema = z.output<typeof queueEnvSchema>;
export type WorkerEnvInput = z.input<typeof workerEnvSchema>;
export type WorkerEnvSchema = z.output<typeof workerEnvSchema>;
export type ServerEnvInput = z.input<typeof serverEnvSchema>;
export type ServerEnvSchema = z.output<typeof serverEnvSchema>;
export type DefaultModelProvider = z.infer<typeof defaultModelProviderSchema>;
