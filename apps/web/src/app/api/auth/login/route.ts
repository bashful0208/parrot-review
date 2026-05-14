import { NextResponse } from "next/server";
import { AppError, createLogger } from "@reviewer/core";
import {
  AUTH_INVALID_CREDENTIALS,
  AUTH_SESSION_COOKIE,
  loginWithPassword,
} from "@reviewer/core";
import { validateEmail, validatePassword } from "@/lib/auth/validators";

export const runtime = "nodejs";

const logger = createLogger({
  component: "api",
  service: "reviewer-web",
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const requestLogger = logger.child({ requestId });

  try {
    const { email, password } = await request.json();

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json(
        {
          ok: false,
          error: emailError,
          error_code: "AUTH_INVALID_EMAIL",
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json(
        {
          ok: false,
          error: passwordError,
          error_code: "AUTH_INVALID_PASSWORD",
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const result = await loginWithPassword({
      email,
      password,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    requestLogger.info("Login request accepted", { userId: result.user.id });

    const response = NextResponse.json({
      ok: true,
      provider: result.provider,
      user: result.user,
    });

    response.cookies.set(AUTH_SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: result.expiresAt,
      path: "/",
    });

    return response;
  } catch (error) {
    requestLogger.error("Login failed", error, {
      operation: "login",
      request: "POST /api/auth/login",
    });

    const message = error instanceof Error ? error.message : "Unknown login error";
    const code = error instanceof AppError ? error.code : undefined;
    const status = message === AUTH_INVALID_CREDENTIALS ? 401 : 500;

    return NextResponse.json(
      {
        ok: false,
        error: message,
        error_code: code,
        request_id: requestId,
      },
      { status }
    );
  }
}
