import { Send } from "@langchain/langgraph";

import type { ReviewGraphStateType } from "./state.js";
import type { PerFindingTask } from "./nodes/critic.js";

export { MAX_REFLECTION_ATTEMPTS } from "./router-constants.js";

/**
 * Create a Send task for each finding whose per-finding state is marked "pending", or signal to skip fan-out.
 *
 * Scans `state.perFinding` for entries with `status === "pending"`. For each such entry returns a `Send` payload targeting the "critic" node; if none are pending, returns the control token `"collect_findings"` to indicate the graph should skip creating subtasks and proceed to collection.
 *
 * @param state - The review graph state containing `perFinding` entries and contextual identifiers used when constructing each Send task.
 * @returns `"collect_findings"` when there are no pending findings, otherwise an array of `Send` tasks (one per pending finding) targeting the "critic" node.
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
