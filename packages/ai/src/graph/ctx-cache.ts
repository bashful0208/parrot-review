import type { FileDiff } from "@reviewer/git";

import type { PreviousIssueSummary } from "../types.js";

/**
 * Per review_run 的大对象缓存。让 diffs / guidelines / projectContext 不进 LangGraph state，
 * 避免 checkpoint 表里塞大字段。生命周期由 handler 通过 setCtx / clearCtx 管理；
 * worker 重启后由 handler 重新加载并 setCtx，再通过 graph.invoke(null) 续跑。
 */
export interface ReviewCtxCacheEntry {
  diffs: FileDiff[];
  guidelines: string;
  projectContext: string;
  /** 增量审查模式下传入；reviewer 节点会注入到 prompt。 */
  previousIssuesSummary?: PreviousIssueSummary[];
}

const cache = new Map<string, ReviewCtxCacheEntry>();

export function setCtx(reviewRunId: string, entry: ReviewCtxCacheEntry): void {
  cache.set(reviewRunId, entry);
}

export function getCtx(reviewRunId: string): ReviewCtxCacheEntry | undefined {
  return cache.get(reviewRunId);
}

export function clearCtx(reviewRunId: string): void {
  cache.delete(reviewRunId);
}
