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

/**
 * Build and compile the review workflow StateGraph used to run reviewers, aggregate findings, optionally reflect via a critic, collect findings, and produce a summary.
 *
 * The graph wires two parallel reviewer nodes ("quality_reviewer" and "security_reviewer") into an "aggregator" which conditionally fans out pending findings to a "critic" (runs reflection loops) or to "collect_findings", then proceeds to "summarizer" and END.
 *
 * @param adapter - AiAdapter injected into nodes (used by reviewer, critic, and summarizer nodes)
 * @param checkpointer - Optional BaseCheckpointSaver passed to compilation; if omitted, checkpoint-based recovery is disabled
 * @returns The compiled StateGraph instance representing the review workflow
 */
export function buildReviewGraph(
  adapter: AiAdapter,
  checkpointer?: BaseCheckpointSaver
) {
  const graph = new StateGraph(ReviewGraphState)
    .addNode("quality_reviewer", makeReviewerNode("quality", adapter))
    .addNode("security_reviewer", makeReviewerNode("security", adapter))
    .addNode("aggregator", aggregator)
    .addNode("critic", makeCriticNode(adapter))
    .addNode("collect_findings", collectFindings)
    .addNode("summarizer", makeSummarizerNode(adapter))
    .addEdge(START, "quality_reviewer")
    .addEdge(START, "security_reviewer")
    .addEdge("quality_reviewer", "aggregator")
    .addEdge("security_reviewer", "aggregator")
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
