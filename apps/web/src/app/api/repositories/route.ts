import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AppError,
  AUTH_SESSION_COOKIE,
  createLogger,
  ErrorCode,
  getOrgIdForUser,
  getSessionUser,
  insertRepositoryWithIntegration,
  registerRepoWebhook,
  updateIntegrationWebhookMetadata,
  type WebhookRegistrationMeta,
} from "@reviewer/core";
import { GiteeProvider, GitHubProvider, type IProvider, type ProviderCredential } from "@reviewer/git";

export const runtime = "nodejs";

const logger = createLogger({ component: "api" });

type SupportedProvider = "github" | "gitee";

function buildProvider(provider: SupportedProvider): IProvider {
  return provider === "github" ? new GitHubProvider() : new GiteeProvider();
}

function buildCredential(provider: SupportedProvider, token: string): ProviderCredential {
  return provider === "github"
    ? { type: "github_pat", token }
    : { type: "gitee_pat", token };
}

function isSupportedProvider(value: unknown): value is SupportedProvider {
  return value === "github" || value === "gitee";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    provider?: unknown;
    providerRepoId?: unknown;
    name?: unknown;
    fullName?: unknown;
    ownerNamespace?: unknown;
    defaultBranch?: unknown;
    token?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body", request_id: requestId },
      { status: 400 }
    );
  }

  const { providerRepoId, name, fullName, ownerNamespace, defaultBranch, token } = body;
  const provider: SupportedProvider = isSupportedProvider(body.provider)
    ? body.provider
    : "github";

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
      provider,
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
    const webhookUrl = `${host}/api/webhooks/${provider}`;

    logger.info("Repository connected", {
      repository_id: result.repositoryId,
      organization_id: orgId,
      provider,
    });

    // 自动注册 webhook；失败不阻塞接入，前端按 webhookRegistration 状态显示横幅
    const providerImpl = buildProvider(provider);
    const credential = buildCredential(provider, token);
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
        fullName,
        webhookUrl,
        secret: webhookSecret,
        credential,
      });
      webhookRegistration = { status: "auto", hookId: reg.hookId };
      metaToWrite = {
        hook_id: reg.hookId,
        mode: "auto",
        registered_at: new Date().toISOString(),
        last_error: null,
      };
      logger.info("Webhook auto-registered", {
        repository_id: result.repositoryId,
        provider,
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
      logger.warn("Webhook auto-registration failed; falling back to manual", {
        repository_id: result.repositoryId,
        provider,
        error_code: appErr.code,
        error_message: appErr.message,
      });
    }

    try {
      await updateIntegrationWebhookMetadata(result.integrationId, metaToWrite);
    } catch (err) {
      logger.warn("Failed to persist webhook metadata; continuing", {
        integration_id: result.integrationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({
      ok: true,
      repositoryId: result.repositoryId,
      webhookUrl,
      webhookSecret,
      webhookRegistration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to connect repository", error as Error, {
      operation: "connect_repository",
      provider,
      request_id: requestId,
    });
    return NextResponse.json(
      { ok: false, error: message, request_id: requestId },
      { status: 500 }
    );
  }
}
