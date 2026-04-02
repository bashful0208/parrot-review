import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { AUTH_SESSION_COOKIE, invalidateSession } from "@reviewer/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;

  if (token) {
    await invalidateSession(token);
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });

  return response;
}
