import { NextResponse } from "next/server";
import { AppError, createLogger, resetPassword } from "@reviewer/core";
import { validatePassword } from "@/lib/auth/validators";

export const runtime = "nodejs";

const logger = createLogger({ component: "api", service: "reviewer-web" });

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const requestLogger = logger.child({ requestId });

  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { ok: false, error: "Reset token is required.", error_code: "AUTH_MISSING_TOKEN", request_id: requestId },
        { status: 400 }
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json(
        { ok: false, error: passwordError, error_code: "AUTH_INVALID_PASSWORD", request_id: requestId },
        { status: 400 }
      );
    }

    await resetPassword({ token, newPassword: password });

    requestLogger.info("Password reset completed");

    return NextResponse.json({ ok: true });
  } catch (error) {
    requestLogger.error("Password reset failed", error, {
      operation: "reset-password",
      request: "POST /api/auth/reset-password",
    });

    const message = error instanceof Error ? error.message : "Reset failed";
    const status = error instanceof AppError ? 400 : 500;

    return NextResponse.json(
      { ok: false, error: message, request_id: requestId },
      { status }
    );
  }
}
