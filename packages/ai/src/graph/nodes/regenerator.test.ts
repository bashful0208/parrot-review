import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { makeRegeneratorNode } from "./regenerator.js";
import { setCtx, clearCtx } from "../ctx-cache.js";
import type { AiAdapter } from "../../adapter.js";
import type { CritiqueResult, ReviewFinding } from "../../types.js";
import type { PerFindingTask } from "./critic.js";
import type { ReviewContextRef } from "../state.js";

const ctxRef: ReviewContextRef = {
  fullName: "o/r",
  prNumber: 1,
  headSha: "h",
  organizationId: "o",
  repositoryId: "r",
  pullRequestId: "p",
  reviewRunId: "rr",
  providerConfigId: "pc",
};

const sample: ReviewFinding = {
  filePath: "a.ts",
  startLine: 1,
  endLine: 1,
  side: "RIGHT",
  issueType: "quality",
  severity: "low",
  title_en: "T",
  title_zh: "标",
  summary_en: "s",
  summary_zh: "总",
  suggestion_en: "g",
  suggestion_zh: "建",
  aiPrompt: "p",
  confidenceScore: 0.5,
};

const fixed: ReviewFinding = { ...sample, startLine: 99, title_en: "FIXED" };

const critique: CritiqueResult = { valid: false, reason: "wrong", confidenceScore: 0.5 };

const makeAdapter = (regen: (f: ReviewFinding) => Promise<ReviewFinding>): AiAdapter => ({
  generateReviewFindings: async () => ({ findings: [] }),
  generateReviewSummary: async () => ({ summary: {} as never }),
  verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
  regenerateFinding: async (f) => regen(f),
});

const baseTask = (overrides: Partial<PerFindingTask> = {}): PerFindingTask => ({
  findingKey: "k1",
  finding: sample,
  attempts: 0,
  reviewRunId: "rr-r",
  contextRef: ctxRef,
  lastCritique: critique,
  ...overrides,
});

describe("regenerator node", () => {
  it("attempts++, status=pending, finding=fixed", async () => {
    setCtx("rr-r", { diffs: [], guidelines: "", projectContext: "" });
    const node = makeRegeneratorNode(makeAdapter(async () => fixed));
    const out = await node(baseTask({ attempts: 0 }));
    assert.equal(out.perFinding["k1"]!.attempts, 1);
    assert.equal(out.perFinding["k1"]!.status, "pending");
    assert.equal(out.perFinding["k1"]!.finding.title_en, "FIXED");
    clearCtx("rr-r");
  });

  it("ctx-cache miss → exhausted bypass, finding unchanged", async () => {
    const node = makeRegeneratorNode(makeAdapter(async () => fixed));
    const out = await node(baseTask({ reviewRunId: "missing" }));
    assert.equal(out.perFinding["k1"]!.status, "exhausted");
    assert.equal(out.perFinding["k1"]!.finding.title_en, "T");
  });

  it("missing lastCritique → exhausted bypass", async () => {
    setCtx("rr-r", { diffs: [], guidelines: "", projectContext: "" });
    const node = makeRegeneratorNode(makeAdapter(async () => fixed));
    const out = await node(baseTask({ lastCritique: null }));
    assert.equal(out.perFinding["k1"]!.status, "exhausted");
    clearCtx("rr-r");
  });
});
