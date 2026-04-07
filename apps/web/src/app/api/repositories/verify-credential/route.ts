import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  getOrgIdForUser,
  getSessionUser,
  listRepositoriesByOrganization,
} from "@reviewer/core";
import { GitHubProvider, GitPlatformAuthError, GitPlatformRateLimitError } from "@reviewer/git";

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

  let token: string;
  try {
    const body = await req.json() as { token?: unknown };
    if (!body.token || typeof body.token !== "string" || body.token.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "token is required", request_id: requestId },
        { status: 400 }
      );
    }
    token = body.token.trim();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body", request_id: requestId },
      { status: 400 }
    );
  }

  try {
    const provider = new GitHubProvider();
    const providerRepos = await provider.listRepositories(
      { type: "github_pat", token },
      { perPage: 100 },
      logger
    );

    // Build set of already-connected provider_repo_ids for this org
    const orgId = await getOrgIdForUser(user.id);
    const connectedIds = new Set<string>();
    if (orgId) {
      const existing = await listRepositoriesByOrganization(orgId);
      for (const r of existing) connectedIds.add(r.provider_repo_id);
    }

    const repositories = providerRepos.map((r) => ({
      providerRepoId: r.providerRepoId,
      name: r.name,
      fullName: r.fullName,
      ownerNamespace: r.ownerNamespace,
      defaultBranch: r.defaultBranch,
      isPrivate: r.isPrivate,
      htmlUrl: r.htmlUrl,
      description: r.description,
      alreadyConnected: connectedIds.has(r.providerRepoId),
    }));

    logger.info("Verified GitHub PAT and fetched repositories", {
      user_id: user.id,
      repo_count: repositories.length,
    });

    return NextResponse.json({ ok: true, repositories });
  } catch (error) {
    if (error instanceof GitPlatformAuthError) {
      return NextResponse.json(
        { ok: false, error: "Invalid GitHub PAT or insufficient permissions", request_id: requestId },
        { status: 400 }
      );
    }
    if (error instanceof GitPlatformRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "GitHub rate limit exceeded, please try again later", request_id: requestId },
        { status: 429 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to verify credential", error as Error, { operation: "verify_credential", request_id: requestId });
    return NextResponse.json(
      { ok: false, error: message, request_id: requestId },
      { status: 500 }
    );
  }
}
