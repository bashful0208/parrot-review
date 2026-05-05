import type { AiAdapter } from "../../adapter.js";
import { getCtx } from "../ctx-cache.js";
import type { ReviewGraphStateType } from "../state.js";

/**
 * Create a summarizer node that produces a review summary from the current state and cached context.
 *
 * The returned async node reads cached context for the state's reviewRunId; if no cached context is available it returns `{ summary: null }`. When context is present it invokes the adapter to generate a review summary and returns `{ summary }` on success. On error it returns `{ summary: null, summaryError }` where `summaryError` is the error message or stringified error.
 *
 * @param adapter - AI adapter used to generate the review summary
 * @returns An async node function that accepts a `ReviewGraphStateType` and returns a partial state containing `summary` on success, or `summary: null` and `summaryError` on failure
 */
export function makeSummarizerNode(adapter: AiAdapter) {
  return async function summarizer(
    state: ReviewGraphStateType
  ): Promise<Partial<ReviewGraphStateType>> {
    const ctx = getCtx(state.reviewRunId);
    if (!ctx) return { summary: null };

    try {
      const { summary } = await adapter.generateReviewSummary({
        ...state.context,
        diffs: ctx.diffs,
        guidelines: ctx.guidelines,
        projectContext: ctx.projectContext,
        finalFindings: state.finalFindings,
      });
      return { summary };
    } catch (err) {
      return {
        summary: null,
        summaryError: err instanceof Error ? err.message : String(err),
      };
    }
  };
}
