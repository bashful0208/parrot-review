import { NextResponse } from "next/server";
import { AppError, createLogger } from "@reviewer/core";
import {
  AUTH_EMAIL_ALREADY_EXISTS,
  AUTH_SESSION_COOKIE,
  registerWithPassword,
} from "@reviewer/core";
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from "@/lib/auth/validators";

export const runtime = "nodejs";

const logger = createLogger({
  component: "api",
  service: "reviewer-web",
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const requestLogger = logger.child({ requestId });

  try {
    const { email, password, confirmPassword } = await request.json();

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

    const confirmPasswordError = validateConfirmPassword(password, confirmPassword);
    if (confirmPasswordError) {
      return NextResponse.json(
        {
          ok: false,
          error: confirmPasswordError,
          error_code: "AUTH_PASSWORD_MISMATCH",
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const result = await registerWithPassword({
      email,
      password,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    requestLogger.info("Register request accepted", {
      email,
      userId: result.user.id,
    });

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
    requestLogger.error("Register failed", error, {
      operation: "register",
      request: "POST /api/auth/register",
    });

    const message = error instanceof Error ? error.message : "Unknown register error";
    const code = error instanceof AppError ? error.code : undefined;
    const status = message === AUTH_EMAIL_ALREADY_EXISTS ? 409 : 500;

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
