import { createAdapter, type AiAdapterConfig } from "./adapter.js";
import type {
  ReviewContext,
  ReviewResult,
  ReviewSummaryResult,
} from "./types.js";

export async function generateReviewFindings(
  context: ReviewContext,
  config: AiAdapterConfig
): Promise<ReviewResult> {
  const adapter = createAdapter(config);
  return adapter.generateReviewFindings(context);
}

export async function generateReviewSummary(
  context: ReviewContext,
  config: AiAdapterConfig
): Promise<ReviewSummaryResult> {
  const adapter = createAdapter(config);
  return adapter.generateReviewSummary(context);
}
