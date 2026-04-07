import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  getOrgIdForUser,
  getSessionUser,
  insertRepositoryWithIntegration,
} from "@reviewer/core";

export const runtime = "nodejs";

const logger = createLogger({ component: "api" });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  // Auth
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    providerRepoId?: unknown;
    name?: unknown;
    fullName?: unknown;
    ownerNamespace?: unknown;
    defaultBranch?: unknown;
    token?: unknown;
  };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body", request_id: requestId },
      { status: 400 }
    );
  }

  const { providerRepoId, name, fullName, ownerNamespace, defaultBranch, token } = body;
  if (
    !providerRepoId || typeof providerRepoId !== "string" ||
    !name || typeof name !== "string" ||
    !fullName || typeof fullName !== "string" ||
    !ownerNamespace || typeof ownerNamespace !== "string" ||
    !defaultBranch || typeof defaultBranch !== "string" ||
    !token || typeof token !== "string"
  ) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields", request_id: requestId },
      { status: 400 }
    );
  }

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) {
    return NextResponse.json(
      { ok: false, error: "No organization found for this user", request_id: requestId },
      { status: 400 }
    );
  }

  try {
    const webhookSecret = randomBytes(32).toString("hex");

    const result = await insertRepositoryWithIntegration({
      organizationId: orgId,
      provider: "github",
      providerRepoId,
      name,
      fullName,
      ownerNamespace,
      defaultBranch,
      credentialToken: token,
      webhookSecret,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const host = appUrl ?? `https://${req.headers.get("host") ?? "localhost"}`;
    const webhookUrl = `${host}/api/webhooks/github`;

    logger.info("Repository connected", {
      repository_id: result.repositoryId,
      organization_id: orgId,
    });

    return NextResponse.json({
      ok: true,
      repositoryId: result.repositoryId,
      webhookUrl,
      webhookSecret,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to connect repository", error as Error, { operation: "connect_repository", request_id: requestId });
    return NextResponse.json(
      { ok: false, error: message, request_id: requestId },
      { status: 500 }
    );
  }
}
