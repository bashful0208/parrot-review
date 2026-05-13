import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, getSessionUser } from "@reviewer/core";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const tokenMatch = cookieHeader?.match(
    new RegExp(`(^|;\\s*)${AUTH_SESSION_COOKIE}=([^;]+)`)
  );
  const token = tokenMatch?.[2];

  if (!token) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const user = await getSessionUser(token);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user });
}
