import { NextResponse } from "next/server";
import { validateEmail, validatePassword } from "@/lib/auth/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json(
        {
          ok: false,
          error: emailError,
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
        },
        { status: 400 }
      );
    }

    // TODO: Implement actual authentication logic
    // For now, return a mock response
    return NextResponse.json({
      ok: true,
      user: {
        id: "mock-user-id",
        email,
        name: email.split("@")[0], // Extract name from email
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown login error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
