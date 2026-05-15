import {
  getReviewRunStatus,
  updateReviewRun,
  TaskCancelledError,
  createLogger,
} from "@reviewer/core";

const logger = createLogger({ component: "worker" });

type CheckFn = (reviewRunId: string) => Promise<void>;

let _impl: CheckFn = defaultCheckCancelled;

/**
 * Override the cancellation check (for testing).
 * Pass `undefined` to restore the default implementation.
 */
export function setCheckCancelled(fn: CheckFn | undefined): void {
  _impl = fn ?? defaultCheckCancelled;
}

async function defaultCheckCancelled(reviewRunId: string): Promise<void> {
  const status = await getReviewRunStatus(reviewRunId);
  if (status === "cancelling") {
    await updateReviewRun(reviewRunId, {
      status: "cancelled",
      finishedAt: new Date(),
    });
    logger.info("Task cancelled at node boundary", {
      review_run_id: reviewRunId,
    });
    throw new TaskCancelledError(reviewRunId);
  }
}

/**
 * 在 LangGraph 节点入口调用：检查 review_run 是否被取消。
 * 若 status === 'cancelling'，更新为 'cancelled' 并抛出 TaskCancelledError。
 */
export async function checkCancelled(reviewRunId: string): Promise<void> {
  return _impl(reviewRunId);
}
