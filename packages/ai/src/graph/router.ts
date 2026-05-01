import { Send } from "@langchain/langgraph";

import type { ReviewGraphStateType } from "./state.js";
import type { PerFindingTask } from "./nodes/critic.js";

export { MAX_REFLECTION_ATTEMPTS } from "./router-constants.js";

/**
 * aggregator → critic：每条 pending finding 派一个 Send 子任务；
 * 没有 pending（即图开图就空 / 全 reviewer 失败）→ 跳过子图直接到 summarizer。
 */
export function fanOutFindings(
  state: ReviewGraphStateType
): "summarizer" | Send[] {
  const pending = Object.entries(state.perFinding).filter(
    ([, ps]) => ps.status === "pending"
  );
  if (pending.length === 0) return "summarizer";

  return pending.map(
    ([key, ps]) =>
      new Send("critic", {
        findingKey: key,
        finding: ps.finding,
        attempts: ps.attempts,
        reviewRunId: state.reviewRunId,
        contextRef: state.context,
        lastCritique: ps.lastCritique,
      } satisfies PerFindingTask)
  );
}

/**
 * critic → regenerator | collect_findings：
 * critic 跑完后看 perFinding 状态：
 *   - 仍 pending（attempts<MAX 且 valid=false） → 派 regenerator 重写
 *   - approved / exhausted → 收尾去 collect_findings
 */
export function fanOutFromCritic(
  state: ReviewGraphStateType
): "collect_findings" | Send[] {
  const stillPending = Object.entries(state.perFinding).filter(
    ([, ps]) => ps.status === "pending"
  );
  if (stillPending.length === 0) return "collect_findings";

  return stillPending.map(
    ([key, ps]) =>
      new Send("regenerator", {
        findingKey: key,
        finding: ps.finding,
        attempts: ps.attempts,
        reviewRunId: state.reviewRunId,
        contextRef: state.context,
        lastCritique: ps.lastCritique,
      } satisfies PerFindingTask)
  );
}

/**
 * regenerator → critic | collect_findings：
 * regenerator 跑完后已 attempts++，status=pending，需要派回 critic 复查。
 * 异常路径（ctx 缺失等）regenerator 会写 status=exhausted，那里走 collect_findings。
 */
export function fanOutFromRegenerator(
  state: ReviewGraphStateType
): "collect_findings" | Send[] {
  const justRegenerated = Object.entries(state.perFinding).filter(
    ([, ps]) => ps.status === "pending"
  );
  if (justRegenerated.length === 0) return "collect_findings";

  return justRegenerated.map(
    ([key, ps]) =>
      new Send("critic", {
        findingKey: key,
        finding: ps.finding,
        attempts: ps.attempts,
        reviewRunId: state.reviewRunId,
        contextRef: state.context,
        lastCritique: ps.lastCritique,
      } satisfies PerFindingTask)
  );
}
