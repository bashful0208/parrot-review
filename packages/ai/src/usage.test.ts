import { test } from "node:test";
import assert from "node:assert/strict";

import { withUsageInstrumentation } from "./usage.js";
import type { UsageContext, UsageEventDraft, UsageRecorder } from "./usage.js";

const ctx: UsageContext = {
  organizationId: "org-1",
  repositoryId: "repo-1",
  pullRequestId: "pr-1",
  reviewRunId: "run-1",
  providerConfigId: "cfg-1",
  provider: "anthropic",
  model: "claude-opus-4-7",
  taskType: "review_findings",
};

function makeRecorder(): {
  record: UsageRecorder;
  drafts: UsageEventDraft[];
} {
  const drafts: UsageEventDraft[] = [];
  return {
    drafts,
    record: async (d) => {
      drafts.push(d);
    },
  };
}

function makeLogger(): {
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  warnings: Array<{ msg: string; extra?: Record<string, unknown> }>;
} {
  const warnings: Array<{ msg: string; extra?: Record<string, unknown> }> = [];
  return {
    warnings,
    warn: (msg, extra) => warnings.push({ msg, extra }),
  };
}

test("withUsageInstrumentation: success path records success=true with tokens + cost + latency", async () => {
  const { record, drafts } = makeRecorder();
  const logger = makeLogger();

  const result = await withUsageInstrumentation(
    ctx,
    async () => ({
      result: "ok-value",
      outcome: { inputTokens: 1000, outputTokens: 500, truncated: false },
    }),
    record,
    logger
  );

  assert.equal(result, "ok-value");
  assert.equal(drafts.length, 1);
  const d = drafts[0]!;
  assert.equal(d.success, true);
  assert.equal(d.errorCode, null);
  assert.equal(d.inputTokens, 1000);
  assert.equal(d.outputTokens, 500);
  assert.ok(d.latencyMs >= 0);
  // 1000 input + 500 output @ claude-opus-4-7 = 0.0525
  assert.ok(d.estimatedCost !== null);
  assert.ok(Math.abs((d.estimatedCost as number) - 0.0525) < 1e-9);
  assert.equal(d.organizationId, "org-1");
  assert.equal(d.taskType, "review_findings");
  assert.equal(d.eventType, "ai_call");
  assert.equal(logger.warnings.length, 0);
});

test("withUsageInstrumentation: truncated outcome -> success=false, errorCode=truncated, tokens kept", async () => {
  const { record, drafts } = makeRecorder();
  const logger = makeLogger();

  const result = await withUsageInstrumentation(
    ctx,
    async () => ({
      result: { findings: [] },
      outcome: { inputTokens: 800, outputTokens: 4096, truncated: true },
    }),
    record,
    logger
  );

  assert.deepEqual(result, { findings: [] });
  assert.equal(drafts.length, 1);
  const d = drafts[0]!;
  assert.equal(d.success, false);
  assert.equal(d.errorCode, "truncated");
  assert.equal(d.inputTokens, 800);
  assert.equal(d.outputTokens, 4096);
});

test("withUsageInstrumentation: thrown error -> success=false, classified errorCode, rethrows original", async () => {
  const { record, drafts } = makeRecorder();
  const logger = makeLogger();

  const original = Object.assign(new Error("rate limited"), { status: 429 });

  await assert.rejects(
    () =>
      withUsageInstrumentation(
        ctx,
        async () => {
          throw original;
        },
        record,
        logger
      ),
    (err: unknown) => err === original
  );

  assert.equal(drafts.length, 1);
  const d = drafts[0]!;
  assert.equal(d.success, false);
  assert.equal(d.errorCode, "rate_limit");
  assert.equal(d.inputTokens, null);
  assert.equal(d.outputTokens, null);
  assert.equal(d.estimatedCost, null);
  assert.ok(d.latencyMs >= 0);
});

test("withUsageInstrumentation: recorder failure on success path -> result still returned, warn logged", async () => {
  const failingRecorder: UsageRecorder = async () => {
    throw new Error("DB connection refused");
  };
  const logger = makeLogger();

  const result = await withUsageInstrumentation(
    ctx,
    async () => ({
      result: "ok",
      outcome: { inputTokens: 10, outputTokens: 20, truncated: false },
    }),
    failingRecorder,
    logger
  );

  assert.equal(result, "ok");
  assert.equal(logger.warnings.length, 1);
  assert.match(logger.warnings[0]!.msg, /usage/i);
});

test("withUsageInstrumentation: recorder failure on error path -> original error rethrown, warn logged", async () => {
  const failingRecorder: UsageRecorder = async () => {
    throw new Error("DB connection refused");
  };
  const logger = makeLogger();
  const original = new Error("AI call exploded");

  await assert.rejects(
    () =>
      withUsageInstrumentation(
        ctx,
        async () => {
          throw original;
        },
        failingRecorder,
        logger
      ),
    (err: unknown) => err === original
  );

  assert.equal(logger.warnings.length, 1);
});

test("withUsageInstrumentation: unknown model -> estimatedCost null but row still written", async () => {
  const { record, drafts } = makeRecorder();
  const logger = makeLogger();

  await withUsageInstrumentation(
    { ...ctx, model: "unknown-model-xyz" },
    async () => ({
      result: "ok",
      outcome: { inputTokens: 100, outputTokens: 50, truncated: false },
    }),
    record,
    logger
  );

  assert.equal(drafts[0]!.estimatedCost, null);
  assert.equal(drafts[0]!.inputTokens, 100);
});
