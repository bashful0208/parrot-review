import { Pool } from "pg";

import { AppError, ErrorCode } from "../errors.js";
import { createLogger } from "../logging.js";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new AppError(
        ErrorCode.DependencyDatabaseConnection,
        "DATABASE_URL is required"
      );
    }
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

export interface InsertUsageEventInput {
  organizationId: string;
  repositoryId: string | null;
  pullRequestId: string | null;
  reviewRunId: string | null;
  providerConfigId: string | null;
  eventType: string;
  taskType: string | null;
  provider: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  estimatedCost: number | null;
  success: boolean | null;
  errorCode: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertUsageEvent(
  input: InsertUsageEventInput
): Promise<{ id: string }> {
  const logger = createLogger({ component: "queue" });

  try {
    const result = await getPool().query<{ id: string }>(
      `insert into public.usage_events
         (organization_id, repository_id, pull_request_id, review_run_id,
          provider_config_id, event_type, task_type, provider, model_name,
          input_tokens, output_tokens, latency_ms, estimated_cost,
          success, error_code, metadata)
       values
         ($1, $2, $3, $4, $5, $6, $7::public.ai_task_type,
          $8::public.ai_provider, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
       returning id`,
      [
        input.organizationId,
        input.repositoryId,
        input.pullRequestId,
        input.reviewRunId,
        input.providerConfigId,
        input.eventType,
        input.taskType,
        input.provider,
        input.modelName,
        input.inputTokens,
        input.outputTokens,
        input.latencyMs,
        input.estimatedCost,
        input.success,
        input.errorCode,
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    const id = result.rows[0]?.id ?? "";
    return { id };
  } catch (error) {
    logger.error("Failed to insert usage_events row", error as Error, {
      operation: "insert_usage_event",
      organization_id: input.organizationId,
      task_type: input.taskType,
      provider: input.provider,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to insert usage_events row"
    );
  }
}
