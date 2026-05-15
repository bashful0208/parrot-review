import {
  getReviewRunStatus,
  updateReviewRun,
  TaskCancelledError,
  createLogger,
} from "@reviewer/core";

const logger = createLogger({ component: "worker" });

/**
 * 在 LangGraph 节点入口调用：检查 review_run 是否被取消。
 * 若 status === 'cancelling'，更新为 'cancelled' 并抛出 TaskCancelledError。
 */
export async function checkCancelled(reviewRunId: string): Promise<void> {
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
