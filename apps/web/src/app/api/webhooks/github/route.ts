import { type NextRequest, NextResponse } from "next/server";

import {
  createLogger,
  enqueueWebhookJob,
  findRepoIntegrationByProviderRepoId,
  insertWebhookEvent,
  markWebhookEventStatus,
} from "@reviewer/core";
import { GitHubProvider } from "@reviewer/git";

import { processProviderWebhook } from "@/lib/webhooks/process";

const logger = createLogger({ component: "api" });
const provider = new GitHubProvider();

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  const result = await processProviderWebhook("github", rawBody, headers, {
    findRepoIntegration: findRepoIntegrationByProviderRepoId,
    insertEvent: insertWebhookEvent,
    enqueueJob: enqueueWebhookJob,
    normalize: (h, b, s) => provider.normalizeWebhookEvent(h, b, s),
    markEventStatus: markWebhookEventStatus,
    logger,
  });

  return NextResponse.json(result.body, { status: result.status });
}
