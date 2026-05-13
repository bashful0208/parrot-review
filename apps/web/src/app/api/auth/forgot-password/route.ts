import { NextResponse } from "next/server";
import { createLogger, requestPasswordReset } from "@reviewer/core";
import { validateEmail } from "@/lib/auth/validators";

export const runtime = "nodejs";

const logger = createLogger({ component: "api", service: "reviewer-web" });

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const requestLogger = logger.child({ requestId });

  try {
    const { email } = await request.json();

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json(
        { ok: false, error: emailError, error_code: "AUTH_INVALID_EMAIL", request_id: requestId },
        { status: 400 }
      );
    }

    await requestPasswordReset({ email });

    requestLogger.info("Password reset requested", { email });

    // Always return success to prevent email enumeration
    return NextResponse.json({ ok: true });
  } catch (error) {
    requestLogger.error("Password reset request failed", error, {
      operation: "forgot-password",
      request: "POST /api/auth/forgot-password",
    });

    // Still return success to prevent email enumeration
    return NextResponse.json({ ok: true });
  }
}
