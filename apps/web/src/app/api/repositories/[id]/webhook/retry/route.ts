import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AppError,
  AUTH_SESSION_COOKIE,
  createLogger,
  ErrorCode,
  getIntegrationByRepository,
  getOrgIdForUser,
  getSessionUser,
  registerRepoWebhook,
  updateIntegrationWebhookMetadata,
  type WebhookRegistrationMeta,
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

export async function POST(
  req: NextRequest,
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

  const integration = await getIntegrationByRepository(id, orgId);
  if (!integration) {
    return NextResponse.json(
      { ok: false, error: "Repository integration not found", request_id: requestId },
      { status: 404 }
    );
  }
  if (!integration.credentialToken) {
    return NextResponse.json(
      { ok: false, error: "No credential on file; please reconnect the repository", request_id: requestId },
      { status: 400 }
    );
  }

  const providerImpl = buildProvider(integration.provider);
  const credential = buildCredential(integration.provider, integration.credentialToken);
  if (!providerImpl || !credential) {
    return NextResponse.json(
      {
        ok: false,
        error: `Provider ${integration.provider} does not support webhook auto-registration`,
        request_id: requestId,
      },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const host = appUrl ?? `https://${req.headers.get("host") ?? "localhost"}`;
  const webhookUrl = `${host}/api/webhooks/${integration.provider}`;

  let webhookRegistration: {
    status: "auto" | "manual";
    hookId?: string;
    errorCode?: string;
    errorMessage?: string;
  };
  let metaToWrite: WebhookRegistrationMeta;
  try {
    const reg = await registerRepoWebhook({
      provider: providerImpl,
      fullName: integration.fullName,
      webhookUrl,
      secret: integration.webhookSecret,
      credential,
    });
    webhookRegistration = { status: "auto", hookId: reg.hookId };
    metaToWrite = {
      hook_id: reg.hookId,
      mode: "auto",
      registered_at: new Date().toISOString(),
      last_error: null,
    };
    logger.info("Webhook re-registered", {
      repository_id: id,
      hook_id: reg.hookId,
      status: reg.status,
    });
  } catch (err) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError(
            ErrorCode.WebhookProviderUnavailable,
            err instanceof Error ? err.message : String(err),
          );
    webhookRegistration = {
      status: "manual",
      errorCode: appErr.code,
      errorMessage: appErr.message,
    };
    metaToWrite = {
      hook_id: null,
      mode: "manual",
      registered_at: null,
      last_error: { code: appErr.code, message: appErr.message },
    };
    logger.warn("Webhook retry failed", {
      repository_id: id,
      error_code: appErr.code,
      error_message: appErr.message,
    });
  }

  try {
    await updateIntegrationWebhookMetadata(integration.integrationId, metaToWrite);
  } catch (err) {
    logger.warn("Failed to persist webhook metadata on retry", {
      integration_id: integration.integrationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    ok: true,
    webhookUrl,
    webhookRegistration,
  });
}
