import { Send } from "@langchain/langgraph";

import type { ReviewGraphStateType } from "./state.js";
import type { PerFindingTask } from "./nodes/critic.js";

export { MAX_REFLECTION_ATTEMPTS } from "./router-constants.js";

/**
 * aggregator → critic：每条 pending finding 派一个 Send 子任务；
 * 反思循环（critic↔regenerator）由 critic 节点内部完成，graph 不再表达该 loop。
 * 没有 pending（即图开图就空 / 全 reviewer 失败）→ 跳过子图直接到 collect_findings。
 */
export function fanOutFindings(
  state: ReviewGraphStateType
): "collect_findings" | Send[] {
  const pending = Object.entries(state.perFinding).filter(
    ([, ps]) => ps.status === "pending"
  );
  if (pending.length === 0) return "collect_findings";

  return pending.map(
    ([key, ps]) =>
      new Send("critic", {
        findingKey: key,
        finding: ps.finding,
        reviewRunId: state.reviewRunId,
        contextRef: state.context,
      } satisfies PerFindingTask)
  );
}
