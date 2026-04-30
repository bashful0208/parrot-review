import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatPayloadSize,
  parseWebhookPage,
  parseWebhookProvider,
  parseWebhookRangeDays,
} from "./format";

test("parseWebhookRangeDays: known values", () => {
  assert.equal(parseWebhookRangeDays("24h"), 1);
  assert.equal(parseWebhookRangeDays("7d"), 7);
  assert.equal(parseWebhookRangeDays("30d"), 30);
});

test("parseWebhookRangeDays: defaults to 24h (1 day)", () => {
  assert.equal(parseWebhookRangeDays(undefined), 1);
  assert.equal(parseWebhookRangeDays(""), 1);
  assert.equal(parseWebhookRangeDays("garbage"), 1);
  assert.equal(parseWebhookRangeDays("90d"), 1);
});

test("parseWebhookProvider: legal values", () => {
  assert.equal(parseWebhookProvider("github"), "github");
  assert.equal(parseWebhookProvider("gitee"), "gitee");
});

test("parseWebhookProvider: 'all' or missing returns null", () => {
  assert.equal(parseWebhookProvider("all"), null);
  assert.equal(parseWebhookProvider(undefined), null);
  assert.equal(parseWebhookProvider(""), null);
});

test("parseWebhookProvider: unknown returns null", () => {
  assert.equal(parseWebhookProvider("gitlab"), null);
  assert.equal(parseWebhookProvider("garbage"), null);
});

test("parseWebhookPage: clamps to >= 1", () => {
  assert.equal(parseWebhookPage("0"), 1);
  assert.equal(parseWebhookPage("-3"), 1);
  assert.equal(parseWebhookPage("not-a-number"), 1);
  assert.equal(parseWebhookPage(undefined), 1);
});

test("parseWebhookPage: passes through valid", () => {
  assert.equal(parseWebhookPage("1"), 1);
  assert.equal(parseWebhookPage("5"), 5);
  assert.equal(parseWebhookPage("1000"), 1000);
});

test("formatPayloadSize: bytes", () => {
  assert.equal(formatPayloadSize(0), "0 B");
  assert.equal(formatPayloadSize(123), "123 B");
  assert.equal(formatPayloadSize(1023), "1023 B");
});

test("formatPayloadSize: KB", () => {
  assert.equal(formatPayloadSize(1024), "1.0 KB");
  assert.equal(formatPayloadSize(1536), "1.5 KB");
});

test("formatPayloadSize: MB", () => {
  assert.equal(formatPayloadSize(1024 * 1024), "1.0 MB");
  assert.equal(formatPayloadSize(1024 * 1024 * 2.5), "2.5 MB");
});
