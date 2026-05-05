import type { AiAdapter } from "../../adapter.js";
import type { ReviewFocus } from "../../types.js";
import { getCtx } from "../ctx-cache.js";
import type { ReviewGraphStateType } from "../state.js";

/**
 * Creates a reviewer node function for the given review focus.
 *
 * The returned node reads cached context by `state.reviewRunId`, invokes the adapter to generate review findings with that context and the provided `focus`, and surfaces results or errors in the returned partial graph state.
 *
 * @param focus - The review role to run (e.g., quality or security)
 * @param adapter - AI adapter used to generate review findings
 * @returns A reviewer node function that accepts a `ReviewGraphStateType` and returns a partial state containing either `draftFindings` (from the adapter) or `reviewerErrors` with `{ role, error }`
 */
export function makeReviewerNode(focus: ReviewFocus, adapter: AiAdapter) {
  return async function reviewer(
    state: ReviewGraphStateType
  ): Promise<Partial<ReviewGraphStateType>> {
    const ctx = getCtx(state.reviewRunId);
    if (!ctx) {
      return {
        reviewerErrors: [{ role: focus, error: "ctx-cache miss" }],
      };
    }

    try {
      const { findings } = await adapter.generateReviewFindings({
        ...state.context,
        diffs: ctx.diffs,
        guidelines: ctx.guidelines,
        projectContext: ctx.projectContext,
        focus,
      });
      return { draftFindings: findings };
    } catch (err) {
      return {
        reviewerErrors: [
          {
            role: focus,
            error: err instanceof Error ? err.message : String(err),
          },
        ],
      };
    }
  };
}
