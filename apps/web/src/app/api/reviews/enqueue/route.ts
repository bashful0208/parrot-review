import "@/lib/startup-env";

import { NextResponse } from "next/server";

import { enqueueReviewJob, createLogger, ensureErrorLogged, AppError } from "@reviewer/core";

export const runtime = "nodejs";

export async function POST() {
  const logger = createLogger({
    component: 'api',
    service: 'reviewer-web',
  });
  const requestId = crypto.randomUUID();
  const requestLogger = logger.child({ requestId });

  try {
    requestLogger.info('Enqueue review job request');

    const job = await enqueueReviewJob();

    requestLogger.info('Review job enqueued successfully', {
      task_id: job.id,
    });

    return NextResponse.json({
      ok: true,
      job,
    });
  } catch (error) {
    ensureErrorLogged(error, requestLogger, {
      operation: 'enqueue_review_job',
      request: 'POST /api/reviews/enqueue',
    });

    const message = error instanceof Error ? error.message : "Unknown enqueue error";
    const code = error instanceof AppError ? error.code : undefined;

    return NextResponse.json(
      {
        ok: false,
        error: message,
        error_code: code,
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}
