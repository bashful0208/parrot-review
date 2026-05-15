import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { makeCriticNode, type PerFindingTask } from "./critic.js";
import { setCtx, clearCtx } from "../ctx-cache.js";
import { setCheckCancelled } from "../cancellation.js";
import type { AiAdapter } from "../../adapter.js";
import type { CritiqueResult, ReviewFinding } from "../../types.js";
import type { ReviewContextRef } from "../state.js";

// Disable DB-dependent cancellation check in unit tests
beforeEach(() => setCheckCancelled(async () => {}));

const ctxRef: ReviewContextRef = {
  fullName: "o/r",
  prNumber: 1,
  headSha: "h",
  organizationId: "o",
  repositoryId: "r",
  pullRequestId: "p",
  reviewRunId: "rr",
  providerConfigId: "pc",
  outputLanguage: "en-US",
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

const baseTask = (over: Partial<PerFindingTask> = {}): PerFindingTask => ({
  findingKey: "k1",
  finding: sample,
  reviewRunId: "rr-c",
  contextRef: ctxRef,
  outputLanguage: "en-US",
  ...over,
});

const buildAdapter = (
  verifyImpl: (f: ReviewFinding) => Promise<CritiqueResult>,
  regenImpl?: (f: ReviewFinding) => Promise<ReviewFinding>
): AiAdapter => ({
  generateReviewFindings: async () => ({ findings: [] }),
  generateReviewSummary: async () => ({ summary: {} as never }),
  verifyFinding: async (f) => verifyImpl(f),
  regenerateFinding: async (f) => (regenImpl ? regenImpl(f) : { ...f }),
});

describe("critic node (with internal reflection loop)", () => {
  it("first call valid=true → status=approved, attempts=0", async () => {
    setCtx("rr-c", { diffs: [], guidelines: "", projectContext: "" });
    const node = makeCriticNode(
      buildAdapter(async () => ({ valid: true, reason: "ok", confidenceScore: 0.9 }))
    );
    const out = await node(baseTask());
    const entry = out.perFinding!["k1"]!;
    assert.equal(entry.status, "approved");
    assert.equal(entry.attempts, 0);
    assert.equal(entry.lastCritique?.valid, true);
    clearCtx("rr-c");
  });

  it("invalid then valid → status=approved on second iter, attempts=1, finding regenerated", async () => {
    setCtx("rr-c", { diffs: [], guidelines: "", projectContext: "" });
    let verifyCount = 0;
    const node = makeCriticNode(
      buildAdapter(
        async (f) => {
          verifyCount++;
          if (f.startLine === 1) {
            return { valid: false, reason: "wrong line", confidenceScore: 0.6 };
          }
          return { valid: true, reason: "ok", confidenceScore: 0.95 };
        },
        async (f) => ({ ...f, startLine: 5 })
      )
    );
    const out = await node(baseTask());
    const entry = out.perFinding!["k1"]!;
    assert.equal(entry.status, "approved");
    assert.equal(entry.attempts, 1);
    assert.equal(entry.finding.startLine, 5);
    assert.equal(verifyCount, 2);
    clearCtx("rr-c");
  });

  it("two invalid in a row + patchedFinding → status=exhausted with patched finding", async () => {
    setCtx("rr-c", { diffs: [], guidelines: "", projectContext: "" });
    const node = makeCriticNode(
      buildAdapter(async (f) => ({
        valid: false,
        reason: "still wrong",
        confidenceScore: 0.4,
        patchedFinding: { ...f, title_en: "PATCHED" },
      }))
    );
    const out = await node(baseTask());
    const entry = out.perFinding!["k1"]!;
    assert.equal(entry.status, "exhausted");
    assert.equal(entry.attempts, 1);
    assert.equal(entry.finding.title_en, "PATCHED");
    clearCtx("rr-c");
  });

  it("ctx-cache miss → status=exhausted bypass, no LLM call", async () => {
    let verifyCalled = false;
    const node = makeCriticNode(
      buildAdapter(async () => {
        verifyCalled = true;
        return { valid: true, reason: "", confidenceScore: 1 };
      })
    );
    const out = await node(baseTask({ reviewRunId: "missing" }));
    assert.equal(out.perFinding!["k1"]!.status, "exhausted");
    assert.equal(verifyCalled, false);
  });
});
