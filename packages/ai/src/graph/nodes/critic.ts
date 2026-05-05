import type { AiAdapter } from "../../adapter.js";
import type { ReviewFinding, CritiqueResult } from "../../types.js";
import { getCtx } from "../ctx-cache.js";
import type { PerFindingState, ReviewContextRef, ReviewGraphStateType } from "../state.js";

import { MAX_REFLECTION_ATTEMPTS } from "../router-constants.js";

/** Send 派给 critic 的子任务体；反思循环在节点内部完成，不再有独立 regenerator 节点。 */
export interface PerFindingTask {
  findingKey: string;
  finding: ReviewFinding;
  reviewRunId: string;
  contextRef: ReviewContextRef;
}

/**
 * Per-finding critic node factory that runs a verify/regenerate reflection loop for a single finding.
 *
 * The returned node function obtains a cached context and, if present, iteratively calls the adapter's
 * verify and regenerate methods up to MAX_REFLECTION_ATTEMPTS:
 * - If a critique is `valid`, the finding is marked `approved` with the last critique.
 * - If the final attempt yields an invalid critique, the finding is finalized as `exhausted`, using
 *   `critique.patchedFinding` if available.
 * - If the required context is missing from the cache, the finding is immediately marked `exhausted`
 *   with `lastCritique.reason` set to `"ctx-cache miss"`.
 * On thrown errors the node returns `exhausted` with `lastCritique.reason` containing the error message
 * and includes a `criticErrors` entry for the finding key.
 *
 * @param adapter - AiAdapter used to verify and regenerate findings during the reflection loop.
 * @returns A node function that accepts a `PerFindingTask` and returns a partial `ReviewGraphStateType`
 */
export function makeCriticNode(adapter: AiAdapter) {
  return async function critic(
    task: PerFindingTask
  ): Promise<Partial<ReviewGraphStateType>> {
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
