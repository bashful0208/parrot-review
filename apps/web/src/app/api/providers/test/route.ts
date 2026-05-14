import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { AUTH_SESSION_COOKIE, createLogger, getSessionUser } from "@reviewer/core";

export const runtime = "nodejs";

const logger = createLogger({ component: "api" });

const VALID_PROVIDERS = ["anthropic", "openai", "alibaba", "custom"] as const;
type ValidProvider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(value: unknown): value is ValidProvider {
  return VALID_PROVIDERS.includes(value as ValidProvider);
}

async function testAnthropic(apiKey: string, model: string, baseUrl?: string) {
  const url = `${(baseUrl || "https://api.anthropic.com").replace(/\/+$/, "")}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 10,
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function testOpenAICompatible(apiKey: string, model: string, baseUrl?: string) {
  const url = `${(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 10,
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    provider?: unknown;
    apiKey?: unknown;
    model?: unknown;
    baseUrl?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { provider, apiKey, model, baseUrl } = body;

  if (!isValidProvider(provider)) {
    return NextResponse.json({ ok: false, error: "Invalid provider" }, { status: 400 });
  }
  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json({ ok: false, error: "apiKey is required" }, { status: 400 });
  }
  if (!model || typeof model !== "string") {
    return NextResponse.json({ ok: false, error: "model is required" }, { status: 400 });
  }

  const url = typeof baseUrl === "string" && baseUrl.trim() !== "" ? baseUrl : undefined;

  try {
    if (provider === "anthropic") {
      await testAnthropic(apiKey, model, url);
    } else {
      await testOpenAICompatible(apiKey, model, url);
    }

    logger.info("Provider connection test passed", { provider, model });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Provider connection test failed", { provider, model, error: message });
    return NextResponse.json({ ok: false, error: message });
  }
}
