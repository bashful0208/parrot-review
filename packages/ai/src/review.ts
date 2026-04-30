import { createAdapter, type AiAdapterConfig } from "./adapter.js";
import type {
  ReviewContext,
  ReviewResult,
  ReviewSummaryResult,
} from "./types.js";
import { noopUsageRecorder, type UsageRecorder } from "./usage.js";

export async function generateReviewFindings(
  context: ReviewContext,
  config: AiAdapterConfig,
  recorder: UsageRecorder = noopUsageRecorder
): Promise<ReviewResult> {
  const adapter = createAdapter(config, recorder);
  return adapter.generateReviewFindings(context);
}

export async function generateReviewSummary(
  context: ReviewContext,
  config: AiAdapterConfig,
  recorder: UsageRecorder = noopUsageRecorder
): Promise<ReviewSummaryResult> {
  const adapter = createAdapter(config, recorder);
  return adapter.generateReviewSummary(context);
}
