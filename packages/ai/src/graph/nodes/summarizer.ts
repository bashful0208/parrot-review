import type { AiAdapter } from "../../adapter.js";
import { getCtx } from "../ctx-cache.js";
import type { ReviewGraphStateType } from "../state.js";

/**
 * summarizer 节点：跑在 critic 之后，能看到过滤后的 finalFindings。
 * 异常仅 warn-and-continue 一致：summary=null，graph 仍正常返回，与 handler 现状 step 8c 行为对齐。
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
