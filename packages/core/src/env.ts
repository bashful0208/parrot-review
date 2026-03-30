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
    provider: string;
    name: string;
  };
  ids: {
    requestIdHeader: "x-request-id";
    taskIdHeader: "x-task-id";
    organizationIdField: "organization_id";
    repositoryIdField: "repository_id";
  };
};

type EnvInput = NodeJS.ProcessEnv &
  Partial<
    Record<
      | "SUPABASE_URL"
      | "SUPABASE_ANON_KEY"
      | "SUPABASE_SERVICE_ROLE_KEY"
      | "REDIS_URL"
      | "REVIEW_QUEUE_NAME"
      | "WEBHOOK_SECRET"
      | "DEFAULT_MODEL_PROVIDER"
      | "DEFAULT_MODEL_NAME",
      string
    >
  >;

function requireEnv(value: string | undefined, key: string): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
}

export function loadRuntimeEnv(
  env: Partial<EnvInput> = process.env
): RuntimeEnv {
  return {
    supabase: {
      url: requireEnv(env.SUPABASE_URL, "SUPABASE_URL"),
      anonKey: requireEnv(env.SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY"),
      serviceRoleKey: requireEnv(
        env.SUPABASE_SERVICE_ROLE_KEY,
        "SUPABASE_SERVICE_ROLE_KEY"
      ),
    },
    redis: {
      url: env.REDIS_URL?.trim() || "redis://127.0.0.1:6379",
      queueName: env.REVIEW_QUEUE_NAME?.trim() || "review-jobs",
    },
    webhook: {
      secret: requireEnv(env.WEBHOOK_SECRET, "WEBHOOK_SECRET"),
    },
    defaultModel: {
      provider: requireEnv(
        env.DEFAULT_MODEL_PROVIDER,
        "DEFAULT_MODEL_PROVIDER"
      ),
      name: requireEnv(env.DEFAULT_MODEL_NAME, "DEFAULT_MODEL_NAME"),
    },
    ids: {
      requestIdHeader: "x-request-id",
      taskIdHeader: "x-task-id",
      organizationIdField: "organization_id",
      repositoryIdField: "repository_id",
    },
  };
}
