import { NextResponse } from "next/server";
import { AppError, createLogger, ensureErrorLogged } from "@reviewer/core";
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

    requestLogger.info("Register request accepted", { email });

    return NextResponse.json({
      ok: true,
      provider: "local",
      user: {
        id: `mock-user-${email}`,
        email,
        name: email.split("@")[0],
      },
    });
  } catch (error) {
    ensureErrorLogged(error, requestLogger, {
      operation: "register",
      request: "POST /api/auth/register",
    });

    const message = error instanceof Error ? error.message : "Unknown register error";
    const code = error instanceof AppError ? error.code : undefined;

    return NextResponse.json(
      {
        ok: false,
        error: message,
        error_code: code,
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}
