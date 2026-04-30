export interface ModelPrice {
  /** USD per 1k input tokens */
  inputPer1k: number;
  /** USD per 1k output tokens */
  outputPer1k: number;
}

/**
 * Static price table. Add models as needed; unknown models are recorded with
 * `estimated_cost = null` rather than guessed.
 *
 * Prices are per-1k tokens in USD and reflect public list prices at the time
 * of writing — not negotiated rates. Update when Anthropic / OpenAI revise.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Claude
  "claude-opus-4-7": { inputPer1k: 0.015, outputPer1k: 0.075 },
  "claude-sonnet-4-6": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-haiku-4-5": { inputPer1k: 0.0008, outputPer1k: 0.004 },

  // OpenAI (representative; extend as projects use them)
  "gpt-4o": { inputPer1k: 0.0025, outputPer1k: 0.01 },
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4.1": { inputPer1k: 0.002, outputPer1k: 0.008 },
};

export function estimateCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  if (
    inputTokens === null ||
    outputTokens === null ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    return null;
  }
  return (
    (inputTokens / 1000) * price.inputPer1k +
    (outputTokens / 1000) * price.outputPer1k
  );
}
