import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  getGraphProgress,
  getOrgIdForUser,
  getReviewRunDetail,
  getSessionUser,
} from "@reviewer/core";

import { buildGraphStatusViewModel } from "@/lib/review-runs/graph-view-model";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const logger = createLogger({ component: "api", service: "reviewer-web" });
  const requestLogger = logger.child({ requestId });

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) {
    return NextResponse.json(
      { ok: false, error: "No organization found" },
      { status: 400 }
    );
  }

  const { id } = await params;

  try {
    // 验证 run 存在且属于当前 org
    const run = await getReviewRunDetail(id, orgId);
    if (!run) {
      return NextResponse.json(
        { ok: false, error: "Review run not found", request_id: requestId },
        { status: 404 }
      );
    }

    // graph_thread_id 由 trigger 自动同步为 id::text
    let progress;
    let diagnostic: string | undefined;
    try {
      progress = await getGraphProgress(id);
      if (!progress) {
        diagnostic = `No checkpoint found for thread_id="${id}" in public.checkpoints. Either the review was run before LangGraph checkpointing was added, or the checkpoint table has no matching record.`;
      }
    } catch (err) {
      diagnostic = err instanceof Error ? err.message : String(err);
    }
    const vm = buildGraphStatusViewModel(progress ?? null, diagnostic);

    return NextResponse.json({
      ok: true,
      data: vm,
    });
  } catch (error) {
    requestLogger.error("Failed to fetch graph status", error as Error, {
      operation: "get_graph_status",
      request: "GET /api/review-runs/[id]/graph-status",
      review_run_id: id,
    });

    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message, request_id: requestId },
      { status: 500 }
    );
  }
}
