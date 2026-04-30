import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatUsd,
  formatCompactNumber,
  formatLatencyMs,
  formatRelativeTime,
  parseUsageRangeDays,
} from "./format.js";

test("formatUsd: zero → $0.00", () => {
  assert.equal(formatUsd(0), "$0.00");
});

test("formatUsd: small value keeps 4 decimals", () => {
  assert.equal(formatUsd(0.0001), "$0.0001");
  assert.equal(formatUsd(0.0125), "$0.0125");
});

test("formatUsd: medium value uses 2 decimals", () => {
  assert.equal(formatUsd(12.345), "$12.35");
  assert.equal(formatUsd(0.5), "$0.50");
});

test("formatUsd: thousands grouping", () => {
  assert.equal(formatUsd(1234.5), "$1,234.50");
});

test("formatCompactNumber: under 1000 raw", () => {
  assert.equal(formatCompactNumber(0), "0");
  assert.equal(formatCompactNumber(50), "50");
  assert.equal(formatCompactNumber(999), "999");
});

test("formatCompactNumber: thousands → k", () => {
  assert.equal(formatCompactNumber(1234), "1.2k");
  assert.equal(formatCompactNumber(99999), "100k");
});

test("formatCompactNumber: millions → M", () => {
  assert.equal(formatCompactNumber(1_234_567), "1.2M");
});

test("formatLatencyMs: sub-second", () => {
  assert.equal(formatLatencyMs(50), "50ms");
  assert.equal(formatLatencyMs(999), "999ms");
});

test("formatLatencyMs: seconds", () => {
  assert.equal(formatLatencyMs(1500), "1.5s");
  assert.equal(formatLatencyMs(15000), "15s");
});

test("formatLatencyMs: minutes", () => {
  assert.equal(formatLatencyMs(65_000), "1m 5s");
  assert.equal(formatLatencyMs(120_000), "2m 0s");
});

test("formatRelativeTime: just now", () => {
  const now = new Date("2026-04-30T12:00:00Z");
  const t = new Date("2026-04-30T11:59:55Z");
  assert.equal(formatRelativeTime(t, now), "just now");
});

test("formatRelativeTime: minutes / hours / days ago", () => {
  const now = new Date("2026-04-30T12:00:00Z");
  assert.equal(
    formatRelativeTime(new Date("2026-04-30T11:55:00Z"), now),
    "5m ago"
  );
  assert.equal(
    formatRelativeTime(new Date("2026-04-30T09:00:00Z"), now),
    "3h ago"
  );
  assert.equal(
    formatRelativeTime(new Date("2026-04-27T12:00:00Z"), now),
    "3d ago"
  );
});

test("parseUsageRangeDays: known values", () => {
  assert.equal(parseUsageRangeDays("7d"), 7);
  assert.equal(parseUsageRangeDays("30d"), 30);
  assert.equal(parseUsageRangeDays("90d"), 90);
});

test("parseUsageRangeDays: defaults to 7d", () => {
  assert.equal(parseUsageRangeDays(undefined), 7);
  assert.equal(parseUsageRangeDays(""), 7);
  assert.equal(parseUsageRangeDays("garbage"), 7);
  assert.equal(parseUsageRangeDays("1d"), 7);
});
