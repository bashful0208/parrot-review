import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  cancelReviewRun,
  createLogger,
  getOrgIdForUser,
  getSessionUser,
} from "@reviewer/core";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
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

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing review run id" },
      { status: 400 }
    );
  }

  try {
    const success = await cancelReviewRun(id);
    if (!success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Review run not found or not in cancellable state",
          request_id: requestId,
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data: { status: "cancelling" } });
  } catch (error) {
    requestLogger.error("Failed to cancel review run", error as Error, {
      operation: "cancel_review_run",
      request: "POST /api/review-runs/[id]/cancel",
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
