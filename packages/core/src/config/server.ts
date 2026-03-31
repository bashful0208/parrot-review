import {
  ConfigValidationError,
  formatConfigError as formatConfigErrorImpl,
} from "./errors.ts";
import type { ConfigValidationError as ConfigValidationErrorShape } from "./errors.ts";
import type {
  DefaultModelProvider,
  QueueEnvInput,
  ServerEnvInput,
  WorkerEnvInput,
} from "./schema.ts";
import { queueEnvSchema, serverEnvSchema, workerEnvSchema } from "./schema.ts";

export function formatConfigError(error: unknown): string {
  return formatConfigErrorImpl(error);
}

export type QueueRuntimeEnv = {
  redis: {
    url: string;
    queueName: string;
  };
};

export type WorkerRuntimeEnv = {
  database: {
    url: string;
  };
  redis: {
    url: string;
    queueName: string;
  };
  webhook: {
    secret: string;
  };
};

export type RuntimeEnv = {
  database: {
    url: string;
  };
  redis: {
    url: string;
    queueName: string;
  };
  webhook: {
    secret: string;
  };
  defaultModel: {
    provider: DefaultModelProvider;
    name: string;
  };
  ids: {
    requestIdHeader: "x-request-id";
    taskIdHeader: "x-task-id";
    organizationIdField: "organization_id";
    repositoryIdField: "repository_id";
  };
};

function isMissingIssue(issue: { code: string; input?: unknown }): boolean {
  if (issue.code === "invalid_type") {
    return true;
  }

  return issue.code === "too_small";
}

function isEmptyInput(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

function collectConfigIssues(
  issues: Array<{ code: string; input?: unknown; path: PropertyKey[] }>,
  env: Partial<Record<string, unknown>>
): ConfigValidationErrorShape {
  const missingKeys = new Set<string>();
  const invalidKeys = new Set<string>();

  for (const issue of issues) {
    const key = String(issue.path[0] ?? "unknown");
    const rawValue = env[key];

    if (
      isMissingIssue(issue) ||
      (issue.code === "invalid_value" && isEmptyInput(rawValue))
    ) {
      missingKeys.add(key);
    } else {
      invalidKeys.add(key);
    }
  }

  return new ConfigValidationError(
    Array.from(missingKeys),
    Array.from(invalidKeys).filter((key) => !missingKeys.has(key))
  );
}

export function loadQueueEnv(
  env: Partial<QueueEnvInput> = process.env
): QueueRuntimeEnv {
  const parsed = queueEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw collectConfigIssues(parsed.error.issues, env);
  }

  return {
    redis: {
      url: parsed.data.REDIS_URL,
      queueName: parsed.data.REVIEW_QUEUE_NAME,
    },
  };
}

export function loadWorkerEnv(
  env: Partial<WorkerEnvInput> = process.env
): WorkerRuntimeEnv {
  const parsed = workerEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw collectConfigIssues(parsed.error.issues, env);
  }

  return {
    database: {
      url: parsed.data.DATABASE_URL,
    },
    redis: {
      url: parsed.data.REDIS_URL,
      queueName: parsed.data.REVIEW_QUEUE_NAME,
    },
    webhook: {
      secret: parsed.data.WEBHOOK_SECRET,
    },
  };
}

export function loadServerEnv(env: Partial<ServerEnvInput> = process.env): RuntimeEnv {
  const parsed = serverEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw collectConfigIssues(parsed.error.issues, env);
  }

  return {
    database: {
      url: parsed.data.DATABASE_URL,
    },
    redis: {
      url: parsed.data.REDIS_URL,
      queueName: parsed.data.REVIEW_QUEUE_NAME,
    },
    webhook: {
      secret: parsed.data.WEBHOOK_SECRET,
    },
    defaultModel: {
      provider: parsed.data.DEFAULT_MODEL_PROVIDER,
      name: parsed.data.DEFAULT_MODEL_NAME,
    },
    ids: {
      requestIdHeader: "x-request-id",
      taskIdHeader: "x-task-id",
      organizationIdField: "organization_id",
      repositoryIdField: "repository_id",
    },
  };
}
