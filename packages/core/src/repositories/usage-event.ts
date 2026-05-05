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
  agentRole?: string | null;
  attemptNumber?: number;
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
          success, error_code, metadata, agent_role, attempt_number)
       values
         ($1, $2, $3, $4, $5, $6, $7::public.ai_task_type,
          $8::public.ai_provider, $9, $10, $11, $12, $13, $14, $15, $16::jsonb,
          $17, $18)
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
        input.agentRole ?? null,
        input.attemptNumber ?? 0,
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

// ---------------------------------------------------------------------------
// Read paths used by the /usage analytics page
// ---------------------------------------------------------------------------

export interface UsageSummary {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  truncatedCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

export interface DailyUsagePoint {
  /** Day in `YYYY-MM-DD` (UTC). */
  day: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface RecentUsageFailure {
  id: string;
  occurredAt: Date;
  taskType: string | null;
  provider: string | null;
  modelName: string | null;
  errorCode: string | null;
  latencyMs: number | null;
  reviewRunId: string | null;
  pullRequestId: string | null;
}

export async function getUsageSummary(
  organizationId: string,
  sinceDays: number
): Promise<UsageSummary> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      total_calls: string;
      success_calls: string;
      failed_calls: string;
      truncated_calls: string;
      total_input: string | null;
      total_output: string | null;
      total_cost: string | null;
      avg_latency: string | null;
      p95_latency: string | null;
    }>(
      `select
         count(*)::bigint as total_calls,
         count(*) filter (where success is true)::bigint as success_calls,
         count(*) filter (where success is false)::bigint as failed_calls,
         count(*) filter (where error_code = 'truncated')::bigint as truncated_calls,
         coalesce(sum(input_tokens), 0)::bigint as total_input,
         coalesce(sum(output_tokens), 0)::bigint as total_output,
         coalesce(sum(estimated_cost), 0)::numeric as total_cost,
         coalesce(avg(latency_ms), 0)::numeric as avg_latency,
         coalesce(percentile_cont(0.95) within group (order by latency_ms), 0)::numeric as p95_latency
       from public.usage_events
       where organization_id = $1
         and event_type = 'ai_call'
         and occurred_at >= now() - ($2::int * interval '1 day')`,
      [organizationId, sinceDays]
    );
    const row = result.rows[0]!;
    return {
      totalCalls: Number(row.total_calls),
      successCalls: Number(row.success_calls),
      failedCalls: Number(row.failed_calls),
      truncatedCalls: Number(row.truncated_calls),
      totalInputTokens: Number(row.total_input ?? 0),
      totalOutputTokens: Number(row.total_output ?? 0),
      totalCostUsd: Number(row.total_cost ?? 0),
      avgLatencyMs: Math.round(Number(row.avg_latency ?? 0)),
      p95LatencyMs: Math.round(Number(row.p95_latency ?? 0)),
    };
  } catch (error) {
    logger.error("Failed to query usage summary", error as Error, {
      operation: "get_usage_summary",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to query usage summary"
    );
  }
}

export async function getDailyUsageStats(
  organizationId: string,
  sinceDays: number
): Promise<DailyUsagePoint[]> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      day: string;
      calls: string;
      cost: string | null;
      input_tk: string | null;
      output_tk: string | null;
    }>(
      `select
         to_char(date_trunc('day', occurred_at) at time zone 'UTC', 'YYYY-MM-DD') as day,
         count(*)::bigint as calls,
         coalesce(sum(estimated_cost), 0)::numeric as cost,
         coalesce(sum(input_tokens), 0)::bigint as input_tk,
         coalesce(sum(output_tokens), 0)::bigint as output_tk
       from public.usage_events
       where organization_id = $1
         and event_type = 'ai_call'
         and occurred_at >= now() - ($2::int * interval '1 day')
       group by 1
       order by 1 asc`,
      [organizationId, sinceDays]
    );
    return result.rows.map((row) => ({
      day: row.day,
      calls: Number(row.calls),
      costUsd: Number(row.cost ?? 0),
      inputTokens: Number(row.input_tk ?? 0),
      outputTokens: Number(row.output_tk ?? 0),
    }));
  } catch (error) {
    logger.error("Failed to query daily usage stats", error as Error, {
      operation: "get_daily_usage_stats",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to query daily usage stats"
    );
  }
}

export async function getRecentUsageFailures(
  organizationId: string,
  limit: number
): Promise<RecentUsageFailure[]> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      id: string;
      occurred_at: Date;
      task_type: string | null;
      provider: string | null;
      model_name: string | null;
      error_code: string | null;
      latency_ms: number | null;
      review_run_id: string | null;
      pull_request_id: string | null;
    }>(
      `select id, occurred_at, task_type, provider, model_name,
              error_code, latency_ms, review_run_id, pull_request_id
       from public.usage_events
       where organization_id = $1
         and event_type = 'ai_call'
         and success is false
       order by occurred_at desc
       limit $2`,
      [organizationId, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      taskType: row.task_type,
      provider: row.provider,
      modelName: row.model_name,
      errorCode: row.error_code,
      latencyMs: row.latency_ms,
      reviewRunId: row.review_run_id,
      pullRequestId: row.pull_request_id,
    }));
  } catch (error) {
    logger.error("Failed to query recent usage failures", error as Error, {
      operation: "get_recent_usage_failures",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to query recent usage failures"
    );
  }
}
