import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  getOrgIdForUser,
  getReviewRunDetail,
  getSessionUser,
  listReviewCommentsByRun,
  listReviewIssuesByRun,
} from "@reviewer/core";

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
    const [run, issues, comments] = await Promise.all([
      getReviewRunDetail(id, orgId),
      listReviewIssuesByRun(id, orgId),
      listReviewCommentsByRun(id, orgId),
    ]);

    if (!run) {
      return NextResponse.json(
        { ok: false, error: "Review run not found", request_id: requestId },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: { run, issues, comments },
    });
  } catch (error) {
    requestLogger.error("Failed to fetch review run detail", error as Error, {
      operation: "get_review_run_detail",
      request: "GET /api/review-runs/[id]",
      review_run_id: id,
    });

    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}
