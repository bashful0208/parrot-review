import type { AiAdapter } from "../../adapter.js";
import type { ReviewFocus } from "../../types.js";
import { getCtx } from "../ctx-cache.js";
import type { ReviewGraphStateType } from "../state.js";

/**
 * Reviewer 节点工厂；quality 与 security 共用同一份实现，仅 focus 不同。
 * 失败不抛：写 reviewerErrors 让 aggregator 看到部分结果，不阻塞另一路 reviewer。
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
