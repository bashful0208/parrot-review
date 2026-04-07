import type { NormalizedWebhookEvent } from "../domain/webhook.js";
export declare function verifyGitHubWebhookSignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean;
export declare function normalizeGitHubEvent(headers: Record<string, string>, rawBody: string, webhookSecret: string): NormalizedWebhookEvent;
