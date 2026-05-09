import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getSessionUser,
  getOrgOutputLanguage,
  updateOrgOutputLanguage,
} from "@reviewer/core";

export const runtime = "nodejs";

const VALID_LANGUAGES = ["zh-CN", "en-US", "es-ES"] as const;
type ValidLanguage = (typeof VALID_LANGUAGES)[number];

function isValidLanguage(value: unknown): value is ValidLanguage {
  return VALID_LANGUAGES.includes(value as ValidLanguage);
}

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

  const language = await getOrgOutputLanguage(orgId);
  return NextResponse.json({ ok: true, language });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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

  let body: { language?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!isValidLanguage(body.language)) {
    return NextResponse.json(
      { ok: false, error: "Invalid language. Must be one of: zh-CN, en-US, es-ES" },
      { status: 400 }
    );
  }

  await updateOrgOutputLanguage(orgId, body.language);
  return NextResponse.json({ ok: true, language: body.language });
}
