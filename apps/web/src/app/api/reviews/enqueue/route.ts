import { NextResponse } from "next/server";

import { enqueueReviewJob } from "@reviewer/core";

export const runtime = "nodejs";

export async function POST() {
  try {
    const job = await enqueueReviewJob();

    return NextResponse.json({
      ok: true,
      job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown enqueue error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
