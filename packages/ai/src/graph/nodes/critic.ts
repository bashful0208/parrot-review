import type { AiAdapter } from "../../adapter.js";
import type { OutputLanguage, ReviewFinding, CritiqueResult } from "../../types.js";
import { checkCancelled } from "../cancellation.js";
import { getCtx } from "../ctx-cache.js";
import type { ReviewContextRef, ReviewGraphStateType } from "../state.js";

import { MAX_REFLECTION_ATTEMPTS } from "../router-constants.js";

/** Send 派给 critic 的子任务体；反思循环在节点内部完成，不再有独立 regenerator 节点。 */
export interface PerFindingTask {
  findingKey: string;
  finding: ReviewFinding;
  reviewRunId: string;
  contextRef: ReviewContextRef;
  outputLanguage: OutputLanguage;
}

/**
 * critic 节点：per-finding 完整反思循环。
 *
 * 内部 while 跑 verify ↔ regenerate，最多 MAX 次：
 *   - 任一次 valid=true → status=approved
 *   - 用尽 MAX 次仍 invalid → status=exhausted（patchedFinding 兜底）
 *   - ctx-cache miss → status=exhausted bypass
 *
 * 把反思循环放在节点内部，避免 LangGraph Send + conditional edge 的"每个子任务完成单独触发出边"
 * 语义对反思循环造成误派。代价：单个 finding 的反思中途 worker 挂了，重启后该 finding 整个 task
 * 重跑（其他 finding 已 checkpoint 的 approved/exhausted 状态保留）。
 */
export function makeCriticNode(adapter: AiAdapter) {
  return async function critic(
    task: PerFindingTask
  ): Promise<Partial<ReviewGraphStateType>> {
    await checkCancelled(task.reviewRunId);

    const ctx = getCtx(task.reviewRunId);
    if (!ctx) {
      return {
        perFinding: {
          [task.findingKey]: {
            finding: task.finding,
            attempts: 0,
            lastCritique: { valid: false, reason: "ctx-cache miss", confidenceScore: 0 },
            status: "exhausted",
          },
        },
      };
    }

    const ctxFull = {
      ...task.contextRef,
      diffs: ctx.diffs,
      guidelines: ctx.guidelines,
      projectContext: ctx.projectContext,
      outputLanguage: task.outputLanguage,
    };

    let finding = task.finding;
    let critique: CritiqueResult | null = null;
    let attempts = 0;

    try {
      while (attempts < MAX_REFLECTION_ATTEMPTS) {
        critique = await adapter.verifyFinding(finding, ctxFull);

        if (critique.valid) {
          return {
            perFinding: {
              [task.findingKey]: {
                finding,
                attempts,
                lastCritique: critique,
                status: "approved",
              },
            },
          };
        }

        if (attempts === MAX_REFLECTION_ATTEMPTS - 1) {
          return {
            perFinding: {
              [task.findingKey]: {
                finding: critique.patchedFinding ?? finding,
                attempts,
                lastCritique: critique,
                status: "exhausted",
              },
            },
          };
        }

        finding = await adapter.regenerateFinding(finding, critique, ctxFull);
        attempts++;
      }

      return {
        perFinding: {
          [task.findingKey]: {
            finding,
            attempts,
            lastCritique: critique,
            status: "exhausted",
          },
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        perFinding: {
          [task.findingKey]: {
            finding,
            attempts,
            lastCritique: {
              valid: false,
              reason: `critic error: ${errorMessage}`,
              confidenceScore: 0,
            },
            status: "exhausted",
          },
        },
        criticErrors: [{ key: task.findingKey, error: errorMessage }],
      };
    }
  };
}
