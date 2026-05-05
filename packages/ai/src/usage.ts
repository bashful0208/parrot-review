import { performance } from "node:perf_hooks";

import { classifyAiError } from "./error-classifier.js";
import { estimateCost } from "./pricing.js";

export type AiProvider = "anthropic" | "openai" | "alibaba" | "custom";

export type AiTaskType =
  | "review_summary"
  | "review_findings"
  | "fix_prompt"
  | "embedding"
  | "verify_finding"
  | "regenerate_finding";

export interface UsageContext {
  organizationId: string;
  repositoryId?: string | null;
  pullRequestId?: string | null;
  reviewRunId?: string | null;
  providerConfigId?: string | null;
  provider: AiProvider;
  model: string;
  taskType: AiTaskType;
  /** LangGraph 节点角色，便于多 agent 归因；老代码不传时为 undefined。 */
  agentRole?: string;
  /** 反思循环迭代号（0-indexed）；老代码不传时为 0。 */
  attemptNumber?: number;
}

export interface CallOutcome {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Set when the SDK returned a response but it hit a length limit
   * (`stop_reason === "max_tokens"` / `finish_reason === "length"`). */
  truncated?: boolean;
  /** Optional bag of provider-specific extras to persist in `metadata`. */
  metadata?: Record<string, unknown>;
}

export interface UsageEventDraft {
  organizationId: string;
  repositoryId: string | null;
  pullRequestId: string | null;
  reviewRunId: string | null;
  providerConfigId: string | null;
  eventType: "ai_call";
  taskType: AiTaskType;
  provider: AiProvider;
  modelName: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCost: number | null;
  success: boolean;
  errorCode: string | null;
  metadata: Record<string, unknown>;
  agentRole: string | null;
  attemptNumber: number;
}

export type UsageRecorder = (event: UsageEventDraft) => Promise<void>;

export interface UsageLogger {
  warn(msg: string, extra?: Record<string, unknown>): void;
}

export const noopUsageRecorder: UsageRecorder = async () => {
  /* drop on the floor */
};

/**
 * Builds the common base fields for a usage event draft from the usage context and measured latency.
 *
 * @param ctx - Usage instrumentation context containing organization/repository/pull request/review run/providerConfig IDs, provider, model, taskType, and optional `agentRole` and `attemptNumber`.
 * @param latencyMs - Measured call latency in milliseconds.
 * @returns A partial UsageEventDraft containing normalized identifiers and call metadata:
 * - `organizationId`, `repositoryId` (or `null`), `pullRequestId` (or `null`), `reviewRunId` (or `null`), `providerConfigId` (or `null`)
 * - `eventType` set to `"ai_call"`, `taskType`, `provider`, `modelName`, `latencyMs`
 * - `agentRole` (or `null`) and `attemptNumber` (defaulted to `0` when not provided)
 */
function buildBaseDraft(
  ctx: UsageContext,
  latencyMs: number
): Pick<
  UsageEventDraft,
  | "organizationId"
  | "repositoryId"
  | "pullRequestId"
  | "reviewRunId"
  | "providerConfigId"
  | "eventType"
  | "taskType"
  | "provider"
  | "modelName"
  | "latencyMs"
  | "agentRole"
  | "attemptNumber"
> {
  return {
    organizationId: ctx.organizationId,
    repositoryId: ctx.repositoryId ?? null,
    pullRequestId: ctx.pullRequestId ?? null,
    reviewRunId: ctx.reviewRunId ?? null,
    providerConfigId: ctx.providerConfigId ?? null,
    eventType: "ai_call",
    taskType: ctx.taskType,
    provider: ctx.provider,
    modelName: ctx.model,
    latencyMs,
    agentRole: ctx.agentRole ?? null,
    attemptNumber: ctx.attemptNumber ?? 0,
  };
}

async function safeRecord(
  recorder: UsageRecorder,
  draft: UsageEventDraft,
  logger: UsageLogger
): Promise<void> {
  try {
    await recorder(draft);
  } catch (err) {
    logger.warn("Failed to write usage_events row; AI call result is unaffected", {
      organization_id: draft.organizationId,
      task_type: draft.taskType,
      provider: draft.provider,
      success: draft.success,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function withUsageInstrumentation<T>(
  ctx: UsageContext,
  run: () => Promise<{ result: T; outcome: CallOutcome }>,
  record: UsageRecorder,
  logger: UsageLogger
): Promise<T> {
  const start = performance.now();
  let result: T;
  let outcome: CallOutcome;
  try {
    const ran = await run();
    result = ran.result;
    outcome = ran.outcome;
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const draft: UsageEventDraft = {
      ...buildBaseDraft(ctx, latencyMs),
      inputTokens: null,
      outputTokens: null,
      estimatedCost: null,
      success: false,
      errorCode: classifyAiError(err),
      metadata: {
        errorMessage: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : undefined,
      },
    };
    await safeRecord(record, draft, logger);
    throw err;
  }

  const latencyMs = Math.round(performance.now() - start);
  const truncated = outcome.truncated === true;
  const draft: UsageEventDraft = {
    ...buildBaseDraft(ctx, latencyMs),
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    estimatedCost: estimateCost(ctx.model, outcome.inputTokens, outcome.outputTokens),
    success: !truncated,
    errorCode: truncated ? "truncated" : null,
    metadata: outcome.metadata ?? {},
  };
  await safeRecord(record, draft, logger);
  return result;
}
