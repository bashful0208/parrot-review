import { createAdapter, type AiAdapterConfig } from "./adapter.js";
import type { ReviewContext, ReviewResult } from "./types.js";

export async function generateReviewFindings(
  context: ReviewContext,
  config: AiAdapterConfig
): Promise<ReviewResult> {
  const adapter = createAdapter(config);
  return adapter.generateReviewFindings(context);
}
