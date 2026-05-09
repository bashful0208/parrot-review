import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  createLogger,
  getOrgIdForUser,
  getSessionUser,
  listAiProviderConfigs,
  createAiProviderConfig,
} from "@reviewer/core";

export const runtime = "nodejs";

const logger = createLogger({ component: "api" });

export async function GET(): Promise<NextResponse> {
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

  try {
    const providers = await listAiProviderConfigs(orgId);
    return NextResponse.json({ ok: true, providers });
  } catch (error) {
    logger.error("Failed to list AI provider configs", error as Error, {
      operation: "list_providers",
    });
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

const VALID_PROVIDERS = ["anthropic", "openai", "alibaba", "custom"] as const;
type ValidProvider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(value: unknown): value is ValidProvider {
  return VALID_PROVIDERS.includes(value as ValidProvider);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  let body: {
    provider?: unknown;
    displayName?: unknown;
    apiKey?: unknown;
    model?: unknown;
    baseUrl?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { provider, displayName, apiKey, model, baseUrl } = body;

  if (!isValidProvider(provider)) {
    return NextResponse.json(
      { ok: false, error: "Invalid provider. Must be one of: anthropic, openai, alibaba, custom" },
      { status: 400 }
    );
  }

  if (!displayName || typeof displayName !== "string" || displayName.trim() === "") {
    return NextResponse.json({ ok: false, error: "displayName is required" }, { status: 400 });
  }

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
    return NextResponse.json({ ok: false, error: "apiKey is required" }, { status: 400 });
  }

  if (!model || typeof model !== "string" || model.trim() === "") {
    return NextResponse.json({ ok: false, error: "model is required" }, { status: 400 });
  }

  if (provider === "custom" && (!baseUrl || typeof baseUrl !== "string" || baseUrl.trim() === "")) {
    return NextResponse.json(
      { ok: false, error: "baseUrl is required for custom provider" },
      { status: 400 }
    );
  }

  try {
    const result = await createAiProviderConfig({
      organizationId: orgId,
      provider,
      displayName,
      apiKey,
      model,
      baseUrl: typeof baseUrl === "string" && baseUrl.trim() !== "" ? baseUrl : undefined,
      createdByUserId: user.id,
    });

    logger.info("AI provider config created via API", {
      config_id: result.id,
      organization_id: orgId,
      provider,
    });

    return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  } catch (error) {
    logger.error("Failed to create AI provider config", error as Error, {
      operation: "create_provider",
    });
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
