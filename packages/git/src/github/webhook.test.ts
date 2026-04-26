import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { normalizeGitHubEvent, verifyGitHubWebhookSignature } from "./webhook.js";

const SECRET = "gh-secret";

function sign(body: string, secret = SECRET): string {
  const digest = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${digest}`;
}

test("verifyGitHubWebhookSignature: missing header rejects", () => {
  assert.equal(verifyGitHubWebhookSignature("body", undefined, SECRET), false);
});

test("verifyGitHubWebhookSignature: bad prefix rejects", () => {
  assert.equal(verifyGitHubWebhookSignature("body", "sha1=abc", SECRET), false);
});

test("verifyGitHubWebhookSignature: correct signature accepts", () => {
  const body = '{"hello":"world"}';
  assert.equal(verifyGitHubWebhookSignature(body, sign(body), SECRET), true);
});

test("verifyGitHubWebhookSignature: tampered body rejects", () => {
  const body = '{"hello":"world"}';
  assert.equal(
    verifyGitHubWebhookSignature(body + "x", sign(body), SECRET),
    false
  );
});

test("verifyGitHubWebhookSignature: wrong secret rejects", () => {
  const body = '{"hello":"world"}';
  assert.equal(
    verifyGitHubWebhookSignature(body, sign(body, "other-secret"), SECRET),
    false
  );
});

test("normalizeGitHubEvent: pull_request opened extracts ids", () => {
  const body = JSON.stringify({
    action: "opened",
    repository: { id: 9001 },
    pull_request: {
      number: 42,
      head: { sha: "headsha" },
      base: { sha: "basesha" },
    },
  });
  const event = normalizeGitHubEvent(
    {
      "x-github-event": "pull_request",
      "x-github-delivery": "delivery-id-1",
      "x-hub-signature-256": sign(body),
    },
    body,
    SECRET
  );
  assert.equal(event.signatureValid, true);
  assert.equal(event.eventType, "pull_request");
  assert.equal(event.deliveryId, "delivery-id-1");
  assert.equal(event.reviewTrigger, "pr_opened");
  assert.equal(event.providerRepoId, "9001");
  assert.equal(event.providerPrNumber, 42);
  assert.equal(event.headSha, "headsha");
  assert.equal(event.baseSha, "basesha");
});

test("normalizeGitHubEvent: synchronize maps to pr_synchronize", () => {
  const body = JSON.stringify({
    action: "synchronize",
    repository: { id: 1 },
    pull_request: { number: 1, head: { sha: "h" }, base: { sha: "b" } },
  });
  const event = normalizeGitHubEvent(
    {
      "x-github-event": "pull_request",
      "x-github-delivery": "d2",
      "x-hub-signature-256": sign(body),
    },
    body,
    SECRET
  );
  assert.equal(event.reviewTrigger, "pr_synchronize");
});

test("normalizeGitHubEvent: ping event has no trigger", () => {
  const body = JSON.stringify({ zen: "..." });
  const event = normalizeGitHubEvent(
    {
      "x-github-event": "ping",
      "x-github-delivery": "d3",
      "x-hub-signature-256": sign(body),
    },
    body,
    SECRET
  );
  assert.equal(event.reviewTrigger, undefined);
  assert.equal(event.providerRepoId, undefined);
});

test("normalizeGitHubEvent: bad signature still parses payload", () => {
  const body = JSON.stringify({
    action: "opened",
    repository: { id: 1 },
    pull_request: { number: 1, head: { sha: "h" }, base: { sha: "b" } },
  });
  const event = normalizeGitHubEvent(
    {
      "x-github-event": "pull_request",
      "x-github-delivery": "d4",
      "x-hub-signature-256": "sha256=deadbeef",
    },
    body,
    SECRET
  );
  assert.equal(event.signatureValid, false);
  assert.equal(event.providerRepoId, "1");
});
