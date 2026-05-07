import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  getOrgIdForUser,
  getSessionUser,
  listReviewRuns,
} from "@reviewer/core";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status") ?? undefined;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const perPage = Math.max(
      1,
      Math.min(parseInt(sp.get("perPage") ?? "20", 10) || 20, 100)
    );

    const result = await listReviewRuns({
      organizationId: orgId,
      status,
      page,
      perPage,
    });

    return NextResponse.json({
      ok: true,
      data: {
        runs: result.rows,
        totalCount: result.totalCount,
        page,
        perPage,
      },
    });
  } catch (error) {
    requestLogger.error("Failed to list review runs", error as Error, {
      operation: "list_review_runs",
      request: "GET /api/review-runs",
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
