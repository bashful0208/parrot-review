import type { FileDiff } from "@reviewer/git";

/**
 * Per review_run 的大对象缓存。让 diffs / guidelines / projectContext 不进 LangGraph state，
 * 避免 checkpoint 表里塞大字段。生命周期由 handler 通过 setCtx / clearCtx 管理；
 * worker 重启后由 handler 重新加载并 setCtx，再通过 graph.invoke(null) 续跑。
 */
export interface ReviewCtxCacheEntry {
  diffs: FileDiff[];
  guidelines: string;
  projectContext: string;
}

const cache = new Map<string, ReviewCtxCacheEntry>();

/**
 * Stores a cache entry for the given review run ID, replacing any existing entry.
 *
 * @param reviewRunId - The cache key identifying the review run
 * @param entry - The review context to store (diffs, guidelines, and projectContext)
 */
export function setCtx(reviewRunId: string, entry: ReviewCtxCacheEntry): void {
  cache.set(reviewRunId, entry);
}

/**
 * Retrieve the cached review context for a given review run.
 *
 * @param reviewRunId - The review run identifier whose cached context to retrieve
 * @returns The `ReviewCtxCacheEntry` for `reviewRunId`, or `undefined` if no entry exists
 */
export function getCtx(reviewRunId: string): ReviewCtxCacheEntry | undefined {
  return cache.get(reviewRunId);
}

/**
 * Removes the cached entry associated with the specified review run.
 *
 * @param reviewRunId - The review run identifier whose cache entry will be removed.
 */
export function clearCtx(reviewRunId: string): void {
  cache.delete(reviewRunId);
}
