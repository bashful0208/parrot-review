import type { AiAdapter } from "../../adapter.js";
import type { ReviewFinding, CritiqueResult } from "../../types.js";
import { getCtx } from "../ctx-cache.js";
import type { PerFindingState, ReviewContextRef } from "../state.js";

import { MAX_REFLECTION_ATTEMPTS } from "../router-constants.js";

/** Send 派给 critic / regenerator 的子任务体，与主 state 解耦。 */
export interface PerFindingTask {
  findingKey: string;
  finding: ReviewFinding;
  attempts: number;
  reviewRunId: string;
  contextRef: ReviewContextRef;
  /** regenerator 节点需要 critic 的 critique 来重写；critic 第一次跑时为 null。 */
  lastCritique: CritiqueResult | null;
}

/**
 * critic 节点：调 adapter.verifyFinding，根据 valid + attempts 决定 status。
 *
 * - valid=true              → status=approved
 * - valid=false, attempts<MAX→ status=pending（router 后续派去 regenerator）
 * - valid=false, attempts≥MAX→ status=exhausted；用 patchedFinding 兜底（若 critic 给了）
 */
export function makeCriticNode(adapter: AiAdapter) {
  return async function critic(
    task: PerFindingTask
  ): Promise<{ perFinding: Record<string, PerFindingState> }> {
    const ctx = getCtx(task.reviewRunId);
    if (!ctx) {
      // ctx 丢失：直接走 exhausted 兜底，不让图卡住
      return {
        perFinding: {
          [task.findingKey]: {
            finding: task.finding,
            attempts: task.attempts,
            lastCritique: { valid: false, reason: "ctx-cache miss", confidenceScore: 0 },
            status: "exhausted",
          },
        },
      };
    }

    const critique = await adapter.verifyFinding(task.finding, {
      ...task.contextRef,
      diffs: ctx.diffs,
      guidelines: ctx.guidelines,
      projectContext: ctx.projectContext,
    });

    let status: PerFindingState["status"];
    let finding = task.finding;
    if (critique.valid) {
      status = "approved";
    } else if (task.attempts >= MAX_REFLECTION_ATTEMPTS - 1) {
      // 这是第 MAX 次，仍不过 → exhausted；patchedFinding 兜底
      status = "exhausted";
      if (critique.patchedFinding) finding = critique.patchedFinding;
    } else {
      status = "pending";
    }

    return {
      perFinding: {
        [task.findingKey]: {
          finding,
          attempts: task.attempts,
          lastCritique: critique,
          status,
        },
      },
    };
  };
}
