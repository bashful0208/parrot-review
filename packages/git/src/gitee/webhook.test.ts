import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { normalizeGiteeEvent, verifyGiteeWebhookSignature } from "./webhook.js";

const SECRET = "super-secret";

test("verifyGiteeWebhookSignature: empty secret rejects", () => {
  assert.equal(verifyGiteeWebhookSignature({ "x-gitee-token": "anything" }, ""), false);
});

test("verifyGiteeWebhookSignature: password mode accepts equal token", () => {
  assert.equal(verifyGiteeWebhookSignature({ "x-gitee-token": SECRET }, SECRET), true);
});

test("verifyGiteeWebhookSignature: password mode rejects different token", () => {
  assert.equal(
    verifyGiteeWebhookSignature({ "x-gitee-token": "wrong" }, SECRET),
    false
  );
});

test("verifyGiteeWebhookSignature: HMAC mode accepts correct signature", () => {
  const timestamp = "1714000000000";
  const expected = createHmac("sha256", SECRET)
    .update(`${timestamp}\n${SECRET}`, "utf8")
    .digest("base64");
  assert.equal(
    verifyGiteeWebhookSignature(
      { "x-gitee-token": expected, "x-gitee-timestamp": timestamp },
      SECRET
    ),
    true
  );
});

test("verifyGiteeWebhookSignature: HMAC mode rejects tampered timestamp", () => {
  const timestamp = "1714000000000";
  const expected = createHmac("sha256", SECRET)
    .update(`${timestamp}\n${SECRET}`, "utf8")
    .digest("base64");
  assert.equal(
    verifyGiteeWebhookSignature(
      { "x-gitee-token": expected, "x-gitee-timestamp": "1714000099999" },
      SECRET
    ),
    false
  );
});

test("verifyGiteeWebhookSignature: HMAC mode without timestamp rejects", () => {
  // Token 不等于 secret，且没有 timestamp 走 HMAC 路径——必须拒绝。
  const expected = createHmac("sha256", SECRET).update("garbage", "utf8").digest("base64");
  assert.equal(
    verifyGiteeWebhookSignature({ "x-gitee-token": expected }, SECRET),
    false
  );
});

test("normalizeGiteeEvent: Merge Request Hook open extracts review trigger and ids", () => {
  const body = JSON.stringify({
    action: "open",
    repository: { id: 123456 },
    pull_request: {
      number: 7,
      head: { sha: "deadbeefhead" },
      base: { sha: "cafef00dbase" },
    },
  });
  const event = normalizeGiteeEvent(
    {
      "x-gitee-event": "Merge Request Hook",
      "x-gitee-token": SECRET,
      "x-gitee-timestamp": "1714000000000",
    },
    body,
    SECRET
  );
  assert.equal(event.signatureValid, true);
  assert.equal(event.eventType, "Merge Request Hook");
  assert.equal(event.reviewTrigger, "pr_opened");
  assert.equal(event.providerRepoId, "123456");
  assert.equal(event.providerPrNumber, 7);
  assert.equal(event.headSha, "deadbeefhead");
  assert.equal(event.baseSha, "cafef00dbase");
});

test("normalizeGiteeEvent: update action maps to pr_synchronize", () => {
  const body = JSON.stringify({
    action: "update",
    repository: { id: 1 },
    pull_request: { number: 1, head: { sha: "h" }, base: { sha: "b" } },
  });
  const event = normalizeGiteeEvent(
    { "x-gitee-event": "Merge Request Hook", "x-gitee-token": SECRET },
    body,
    SECRET
  );
  assert.equal(event.reviewTrigger, "pr_synchronize");
});

test("normalizeGiteeEvent: non-MR event has no review trigger but stays parseable", () => {
  const body = JSON.stringify({ repository: { id: 9 } });
  const event = normalizeGiteeEvent(
    { "x-gitee-event": "Push Hook", "x-gitee-token": SECRET },
    body,
    SECRET
  );
  assert.equal(event.reviewTrigger, undefined);
  assert.equal(event.providerRepoId, undefined);
});

test("normalizeGiteeEvent: bad signature is reported but parse still works", () => {
  const body = JSON.stringify({
    action: "open",
    repository: { id: 1 },
    pull_request: { number: 1, head: { sha: "h" }, base: { sha: "b" } },
  });
  const event = normalizeGiteeEvent(
    { "x-gitee-event": "Merge Request Hook", "x-gitee-token": "wrong" },
    body,
    SECRET
  );
  assert.equal(event.signatureValid, false);
  assert.equal(event.providerRepoId, "1");
});
