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
type EnvInput = NodeJS.ProcessEnv & Partial<Record<"SUPABASE_URL" | "SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY" | "REDIS_URL" | "REVIEW_QUEUE_NAME" | "WEBHOOK_SECRET" | "DEFAULT_MODEL_PROVIDER" | "DEFAULT_MODEL_NAME", string>>;
export declare function loadRuntimeEnv(env?: Partial<EnvInput>): RuntimeEnv;
export {};
