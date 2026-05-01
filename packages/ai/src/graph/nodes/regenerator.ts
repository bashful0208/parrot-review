import type { AiAdapter } from "../../adapter.js";
import { getCtx } from "../ctx-cache.js";
import type { PerFindingState } from "../state.js";

import type { PerFindingTask } from "./critic.js";

/**
 * regenerator 节点：拿 critic 的 critique 把 finding 重写；attempts++，status=pending（回到 critic 复查）。
 * 异常情况：ctx-cache 丢失 / critique 缺失 → exhausted 兜底，不卡住图。
 */
export function makeRegeneratorNode(adapter: AiAdapter) {
  return async function regenerator(
    task: PerFindingTask
  ): Promise<{ perFinding: Record<string, PerFindingState> }> {
    const ctx = getCtx(task.reviewRunId);
    if (!ctx) {
      return {
        perFinding: {
          [task.findingKey]: {
            finding: task.finding,
            attempts: task.attempts + 1,
            lastCritique: task.lastCritique,
            status: "exhausted",
          },
        },
      };
    }

    if (!task.lastCritique) {
      // 不应该发生（router 只在 critic 写入 lastCritique 后才派 regenerator）；保护性兜底
      return {
        perFinding: {
          [task.findingKey]: {
            finding: task.finding,
            attempts: task.attempts + 1,
            lastCritique: null,
            status: "exhausted",
          },
        },
      };
    }

    const fixed = await adapter.regenerateFinding(task.finding, task.lastCritique, {
      ...task.contextRef,
      diffs: ctx.diffs,
      guidelines: ctx.guidelines,
      projectContext: ctx.projectContext,
    });

    return {
      perFinding: {
        [task.findingKey]: {
          finding: fixed,
          attempts: task.attempts + 1,
          lastCritique: task.lastCritique,
          status: "pending", // 回 critic 复查
        },
      },
    };
  };
}
