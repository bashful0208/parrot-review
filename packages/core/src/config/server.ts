import type {
  DefaultModelProvider,
  QueueEnvInput,
  ServerEnvInput,
  WorkerEnvInput,
} from "./schema.js";

const runtimeExtension = import.meta.url.endsWith(".ts") ? "ts" : "js";

const { ConfigValidationError, formatConfigError: formatConfigErrorImpl } =
  (await import(
    new URL(`./errors.${runtimeExtension}`, import.meta.url).href
  )) as typeof import("./errors.js");
const { queueEnvSchema, serverEnvSchema, workerEnvSchema } = (await import(
  new URL(`./schema.${runtimeExtension}`, import.meta.url).href
)) as typeof import("./schema.js");

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
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
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
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
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

  return issue.code === "too_small" || issue.input === undefined;
}

function collectConfigIssues(
  issues: Array<{ code: string; input?: unknown; path: PropertyKey[] }>
): ConfigValidationError {
  const missingKeys = new Set<string>();
  const invalidKeys = new Set<string>();

  for (const issue of issues) {
    const key = String(issue.path[0] ?? "unknown");
    if (isMissingIssue(issue)) {
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
    throw collectConfigIssues(parsed.error.issues);
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
    throw collectConfigIssues(parsed.error.issues);
  }

  return {
    supabase: {
      url: parsed.data.SUPABASE_URL,
      anonKey: parsed.data.SUPABASE_ANON_KEY,
      serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
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
    throw collectConfigIssues(parsed.error.issues);
  }

  return {
    supabase: {
      url: parsed.data.SUPABASE_URL,
      anonKey: parsed.data.SUPABASE_ANON_KEY,
      serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
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
