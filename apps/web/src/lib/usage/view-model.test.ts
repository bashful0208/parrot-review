import { test } from "node:test";
import assert from "node:assert/strict";

import { buildUsageViewModel } from "./view-model.js";

const baseUser = { id: "u-1", email: "u@example.com", name: "Alice" };

test("buildUsageViewModel: KPI cards reflect summary", () => {
  const vm = buildUsageViewModel({
    user: baseUser,
    summary: {
      totalCalls: 100,
      successCalls: 95,
      failedCalls: 5,
      truncatedCalls: 2,
      totalInputTokens: 12_000,
      totalOutputTokens: 8_000,
      totalCostUsd: 1.23,
      avgLatencyMs: 1500,
      p95LatencyMs: 4000,
    },
    daily: [],
    failures: [],
    rangeDays: 7,
  });

  const labels = vm.kpis.map((k) => k.label);
  assert.deepEqual(labels, [
    "Total calls",
    "Success rate",
    "Total cost",
    "Avg / p95 latency",
  ]);
  assert.equal(vm.kpis[0]!.value, "100");
  assert.equal(vm.kpis[1]!.value, "95.0%");
  assert.equal(vm.kpis[2]!.value, "$1.23");
  assert.equal(vm.kpis[3]!.value, "1.5s / 4s");
  assert.ok(vm.hasData);
});

test("buildUsageViewModel: zero calls disables hasData and gives '—' success rate", () => {
  const vm = buildUsageViewModel({
    user: baseUser,
    summary: {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      truncatedCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
    },
    daily: [],
    failures: [],
    rangeDays: 7,
  });
  assert.equal(vm.hasData, false);
  assert.equal(vm.kpis[1]!.value, "—");
});

test("buildUsageViewModel: range options mark active range", () => {
  const vm = buildUsageViewModel({
    user: baseUser,
    summary: {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      truncatedCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
    },
    daily: [],
    failures: [],
    rangeDays: 30,
  });
  const active = vm.range.options.filter((o) => o.active);
  assert.equal(active.length, 1);
  assert.equal(active[0]!.key, "30d");
});

test("buildUsageViewModel: daily points get formatted day + cost", () => {
  const vm = buildUsageViewModel({
    user: baseUser,
    summary: {
      totalCalls: 1,
      successCalls: 1,
      failedCalls: 0,
      truncatedCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0.05,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
    },
    daily: [{ day: "2026-04-30", calls: 3, costUsd: 0.05, inputTokens: 0, outputTokens: 0 }],
    failures: [],
    rangeDays: 7,
  });
  assert.equal(vm.daily.length, 1);
  assert.match(vm.daily[0]!.shortDay, /Apr 30/);
  assert.equal(vm.daily[0]!.costLabel, "$0.0500");
});

test("buildUsageViewModel: failures table maps fields with relative time", () => {
  const now = new Date("2026-04-30T12:00:00Z");
  const vm = buildUsageViewModel({
    user: baseUser,
    summary: {
      totalCalls: 1,
      successCalls: 0,
      failedCalls: 1,
      truncatedCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
    },
    daily: [],
    failures: [
      {
        id: "fail-1",
        occurredAt: new Date("2026-04-30T11:55:00Z"),
        taskType: "review_findings",
        provider: "anthropic",
        modelName: "claude-opus-4-7",
        errorCode: "rate_limit",
        latencyMs: 234,
        reviewRunId: "run-1",
        pullRequestId: "pr-1",
      },
    ],
    rangeDays: 7,
    now,
  });
  assert.equal(vm.failures.length, 1);
  const row = vm.failures[0]!;
  assert.equal(row.errorCodeLabel, "rate_limit");
  assert.equal(row.latencyLabel, "234ms");
  assert.equal(row.occurredAtLabel, "5m ago");
  assert.equal(row.reviewRunId, "run-1");
});
