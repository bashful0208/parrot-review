import {
  StateGraph,
  START,
  END,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";

import type { AiAdapter } from "../adapter.js";

import { ReviewGraphState } from "./state.js";
import { aggregator } from "./nodes/aggregator.js";
import { makeReviewerNode } from "./nodes/reviewer.js";
import { makeCriticNode } from "./nodes/critic.js";
import { collectFindings } from "./nodes/collect.js";
import { makeSummarizerNode } from "./nodes/summarizer.js";
import { fanOutFindings } from "./router.js";
import {
  scanErrorHandlingPatterns,
  formatScannedPatternsForPrompt,
} from "./nodes/error-handler-scanner.js";

/**
 * 编译 review graph。adapter 由调用方注入（带 usageRecorder）；
 * checkpointer 可选——生产用 PostgresSaver、测试用 MemorySaver；不传则节点级断点恢复失效。
 *
 * 节点拓扑：
 *   START ─→ quality_reviewer ───┐
 *   START ─→ security_reviewer ──┤
 *   START ─→ error_handler ──────┴→ aggregator
 *                                   │
 *                                   ├─Send per pending finding──→ critic*
 *                                   │  (critic 节点内部跑反思循环 verify↔regenerate)
 *                                   │
 *                                   └─空时──┐
 *                                            ▼
 *                                  collect_findings ──→ summarizer ──→ END
 */
export function buildReviewGraph(
  adapter: AiAdapter,
  checkpointer?: BaseCheckpointSaver
) {
  const graph = new StateGraph(ReviewGraphState)
    .addNode(
      "quality_reviewer",
      makeReviewerNode("quality", adapter, { confidenceThreshold: 0.8 })
    )
    .addNode("security_reviewer", makeReviewerNode("security", adapter))
    .addNode(
      "error_handler_reviewer",
      makeReviewerNode("error_handling", adapter, {
        preScanContextFn: (diffs) =>
          formatScannedPatternsForPrompt(scanErrorHandlingPatterns(diffs)),
        confidenceThreshold: 0.7,
      })
    )
    .addNode("aggregator", aggregator)
    .addNode("critic", makeCriticNode(adapter))
    .addNode("collect_findings", collectFindings)
    .addNode("summarizer", makeSummarizerNode(adapter))
    .addEdge(START, "quality_reviewer")
    .addEdge(START, "security_reviewer")
    .addEdge(START, "error_handler_reviewer")
    .addEdge("quality_reviewer", "aggregator")
    .addEdge("security_reviewer", "aggregator")
    .addEdge("error_handler_reviewer", "aggregator")
    .addConditionalEdges("aggregator", fanOutFindings, [
      "critic",
      "collect_findings",
    ])
    .addEdge("critic", "collect_findings")
    .addEdge("collect_findings", "summarizer")
    .addEdge("summarizer", END);

  return graph.compile({ checkpointer });
}

export type ReviewGraph = ReturnType<typeof buildReviewGraph>;

export { setCtx, getCtx, clearCtx } from "./ctx-cache.js";
export type { ReviewCtxCacheEntry } from "./ctx-cache.js";
export { ReviewGraphState } from "./state.js";
export type {
  PerFindingState,
  ReviewContextRef,
  ReviewGraphStateType,
} from "./state.js";
export { MAX_REFLECTION_ATTEMPTS } from "./router-constants.js";
