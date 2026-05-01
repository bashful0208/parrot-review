import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { makeCriticNode, type PerFindingTask } from "./critic.js";
import { setCtx, clearCtx } from "../ctx-cache.js";
import type { AiAdapter } from "../../adapter.js";
import type { CritiqueResult, ReviewFinding } from "../../types.js";
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
const patched: ReviewFinding = { ...sample, startLine: 9, title_en: "P" };

const makeAdapter = (verify: (f: ReviewFinding) => Promise<CritiqueResult>): AiAdapter => ({
  generateReviewFindings: async () => ({ findings: [] }),
  generateReviewSummary: async () => ({ summary: {} as never }),
  verifyFinding: async (f) => verify(f),
  regenerateFinding: async () => sample,
});

const baseTask = (overrides: Partial<PerFindingTask> = {}): PerFindingTask => ({
  findingKey: "k1",
  finding: sample,
  attempts: 0,
  reviewRunId: "rr-c",
  contextRef: ctxRef,
  lastCritique: null,
  ...overrides,
});

describe("critic node", () => {
  it("valid=true → status=approved, finding unchanged", async () => {
    setCtx("rr-c", { diffs: [], guidelines: "", projectContext: "" });
    const node = makeCriticNode(
      makeAdapter(async () => ({ valid: true, reason: "ok", confidenceScore: 0.9 }))
    );
    const out = await node(baseTask());
    const entry = out.perFinding["k1"]!;
    assert.equal(entry.status, "approved");
    assert.equal(entry.finding.title_en, "T");
    clearCtx("rr-c");
  });

  it("valid=false + attempts<MAX-1 → status=pending", async () => {
    setCtx("rr-c", { diffs: [], guidelines: "", projectContext: "" });
    const node = makeCriticNode(
      makeAdapter(async () => ({ valid: false, reason: "wrong", confidenceScore: 0.6 }))
    );
    const out = await node(baseTask({ attempts: 0 }));
    assert.equal(out.perFinding["k1"]!.status, "pending");
    clearCtx("rr-c");
  });

  it("valid=false + attempts>=MAX-1 + patchedFinding → status=exhausted, finding=patched", async () => {
    setCtx("rr-c", { diffs: [], guidelines: "", projectContext: "" });
    const node = makeCriticNode(
      makeAdapter(async () => ({
        valid: false,
        reason: "still wrong",
        confidenceScore: 0.4,
        patchedFinding: patched,
      }))
    );
    const out = await node(baseTask({ attempts: 1 }));
    assert.equal(out.perFinding["k1"]!.status, "exhausted");
    assert.equal(out.perFinding["k1"]!.finding.title_en, "P");
    clearCtx("rr-c");
  });

  it("valid=false + attempts>=MAX-1 + no patchedFinding → status=exhausted, finding=original", async () => {
    setCtx("rr-c", { diffs: [], guidelines: "", projectContext: "" });
    const node = makeCriticNode(
      makeAdapter(async () => ({
        valid: false,
        reason: "still wrong",
        confidenceScore: 0.4,
      }))
    );
    const out = await node(baseTask({ attempts: 1 }));
    assert.equal(out.perFinding["k1"]!.status, "exhausted");
    assert.equal(out.perFinding["k1"]!.finding.title_en, "T");
    clearCtx("rr-c");
  });

  it("ctx-cache miss → exhausted bypass", async () => {
    const node = makeCriticNode(makeAdapter(async () => ({ valid: true, reason: "", confidenceScore: 1 })));
    const out = await node(baseTask({ reviewRunId: "missing" }));
    assert.equal(out.perFinding["k1"]!.status, "exhausted");
    assert.equal(out.perFinding["k1"]!.lastCritique?.reason, "ctx-cache miss");
  });
});
