import type { DefaultModelProvider, ServerEnvInput } from "./schema.js";

const runtimeExtension = import.meta.url.endsWith(".ts") ? "ts" : "js";

const { ConfigValidationError, formatConfigError: formatConfigErrorImpl } =
  (await import(
    new URL(`./errors.${runtimeExtension}`, import.meta.url).href
  )) as typeof import("./errors.js");
const { serverEnvSchema } = (await import(
  new URL(`./schema.${runtimeExtension}`, import.meta.url).href
)) as typeof import("./schema.js");

export function formatConfigError(error: unknown): string {
  return formatConfigErrorImpl(error);
}

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

export function loadServerEnv(env: Partial<ServerEnvInput> = process.env): RuntimeEnv {
  const parsed = serverEnvSchema.safeParse(env);

  if (!parsed.success) {
    const missingKeys = new Set<string>();
    const invalidKeys = new Set<string>();

    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "unknown");
      if (isMissingIssue(issue)) {
        missingKeys.add(key);
      } else {
        invalidKeys.add(key);
      }
    }

    throw new ConfigValidationError(
      Array.from(missingKeys),
      Array.from(invalidKeys).filter((key) => !missingKeys.has(key))
    );
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
