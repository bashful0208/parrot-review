import type { FileDiff } from "@reviewer/git";

import type { AiAdapter } from "../../adapter.js";
import type { ReviewFocus } from "../../types.js";
import { checkCancelled } from "../cancellation.js";
import { getCtx } from "../ctx-cache.js";
import type { ReviewGraphStateType } from "../state.js";

export interface ReviewerNodeOpts {
  /** Called before the LLM call; result is prepended to guidelines as extra context. */
  preScanContextFn?: (diffs: FileDiff[]) => string;
  /** Post-filter findings by confidence score (0 = no filter). */
  confidenceThreshold?: number;
}

/**
 * Reviewer 节点工厂；quality / security / error_handling 共用同一份实现，仅 focus 不同。
 * 失败不抛：写 reviewerErrors 让 aggregator 看到部分结果，不阻塞另一路 reviewer。
 */
export function makeReviewerNode(
  focus: ReviewFocus,
  adapter: AiAdapter,
  opts?: ReviewerNodeOpts
) {
  return async function reviewer(
    state: ReviewGraphStateType
  ): Promise<Partial<ReviewGraphStateType>> {
    const ctx = getCtx(state.reviewRunId);
    if (!ctx) {
      return {
        reviewerErrors: [{ role: focus, error: "ctx-cache miss" }],
      };
    }

    await checkCancelled(state.reviewRunId);

    try {
      // Pre-scan for extra context (e.g. deterministic error-handling patterns)
      const extraContext = opts?.preScanContextFn
        ? opts.preScanContextFn(ctx.diffs)
        : "";

      const effectiveGuidelines = extraContext
        ? extraContext + "\n" + (ctx.guidelines ?? "")
        : ctx.guidelines;

      const { findings } = await adapter.generateReviewFindings({
        ...state.context,
        diffs: ctx.diffs,
        guidelines: effectiveGuidelines,
        projectContext: ctx.projectContext,
        focus,
        outputLanguage: state.outputLanguage,
      });

      // Post-filter by confidence threshold
      const threshold = opts?.confidenceThreshold ?? 0;
      const filtered =
        threshold > 0
          ? findings.filter((f) => f.confidenceScore >= threshold)
          : findings;

      return { draftFindings: filtered };
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
