import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  getOrgIdForUser,
  getSessionUser,
  deleteAiProviderConfig,
} from "@reviewer/core";

export const runtime = "nodejs";

const logger = createLogger({ component: "api" });

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) {
    return NextResponse.json({ ok: false, error: "No organization found" }, { status: 400 });
  }

  const { id } = await params;

  try {
    await deleteAiProviderConfig(id, orgId);

    logger.info("AI provider config deleted via API", {
      config_id: id,
      organization_id: orgId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cannot delete")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    logger.error("Failed to delete AI provider config", error as Error, {
      operation: "delete_provider",
      config_id: id,
    });
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
