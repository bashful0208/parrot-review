import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  disableRepository,
  getOrgIdForUser,
  getRepositoryById,
  getSessionUser,
} from "@reviewer/core";

export const runtime = "nodejs";

const logger = createLogger({ component: "api" });

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const { id } = await ctx.params;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) {
    return NextResponse.json(
      { ok: false, error: "No organization found for this user", request_id: requestId },
      { status: 400 }
    );
  }

  try {
    const repo = await getRepositoryById(id, orgId);
    if (!repo) {
      return NextResponse.json(
        { ok: false, error: "Repository not found", request_id: requestId },
        { status: 404 }
      );
    }

    const disabled = await disableRepository(id, orgId);
    if (!disabled) {
      return NextResponse.json(
        { ok: false, error: "Repository is already disabled", request_id: requestId },
        { status: 409 }
      );
    }

    logger.info("Repository disabled", {
      repository_id: id,
      organization_id: orgId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to disable repository", error as Error, {
      operation: "disable_repository",
      request_id: requestId,
    });
    return NextResponse.json(
      { ok: false, error: message, request_id: requestId },
      { status: 500 }
    );
  }
}
