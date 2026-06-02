import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  disableRepository,
  getIntegrationByRepository,
  getOrgIdForUser,
  getRepositoryById,
  getSessionUser,
} from "@reviewer/core";
import { GiteeProvider, GitHubProvider, type IProvider, type ProviderCredential } from "@reviewer/git";

export const runtime = "nodejs";

const logger = createLogger({ component: "api" });

function buildProvider(provider: string): IProvider | null {
  if (provider === "github") return new GitHubProvider();
  if (provider === "gitee") return new GiteeProvider();
  return null;
}

function buildCredential(provider: string, token: string): ProviderCredential | null {
  if (provider === "github") return { type: "github_pat", token };
  if (provider === "gitee") return { type: "gitee_pat", token };
  return null;
}

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

    // Best-effort: 删除远端 webhook；失败仅 warn，不阻塞 disable
    const integration = await getIntegrationByRepository(id, orgId);
    if (integration?.webhookMeta?.hook_id && integration.credentialToken) {
      const providerImpl = buildProvider(integration.provider);
      const credential = buildCredential(integration.provider, integration.credentialToken);
      if (providerImpl && credential) {
        try {
          await providerImpl.deleteWebhook(
            integration.fullName,
            integration.webhookMeta.hook_id,
            credential,
            logger
          );
          logger.info("Remote webhook deleted on disconnect", {
            repository_id: id,
            hook_id: integration.webhookMeta.hook_id,
          });
        } catch (err) {
          logger.warn("Failed to delete remote webhook on disconnect", {
            repository_id: id,
            hook_id: integration.webhookMeta.hook_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
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
