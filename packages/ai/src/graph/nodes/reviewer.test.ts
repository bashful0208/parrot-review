import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { makeReviewerNode } from "./reviewer.js";
import { setCtx, clearCtx } from "../ctx-cache.js";
import { setCheckCancelled } from "../cancellation.js";
import type { AiAdapter } from "../../adapter.js";
import type { ReviewFinding } from "../../types.js";
import type { ReviewGraphStateType } from "../state.js";

// Disable DB-dependent cancellation check in unit tests
beforeEach(() => setCheckCancelled(async () => {}));

function fakeFinding(over: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    filePath: "a.ts",
    startLine: 1,
    endLine: 1,
    side: "RIGHT",
    issueType: "quality",
    severity: "low",
    title_en: "x",
    title_zh: "x",
    summary_en: "x",
    summary_zh: "x",
    suggestion_en: "x",
    suggestion_zh: "x",
    aiPrompt: "x",
    confidenceScore: 0.5,
    ...over,
  };
}

const baseState = (reviewRunId = "rr"): ReviewGraphStateType => ({
  reviewRunId,
  outputLanguage: "en-US",
  context: {
    fullName: "o/r",
    prNumber: 1,
    headSha: "h",
    organizationId: "o",
    repositoryId: "r",
    pullRequestId: "p",
    reviewRunId,
    providerConfigId: "pc",
    outputLanguage: "en-US",
  },
  draftFindings: [],
  reviewerErrors: [],
  aggregatedFindings: [],
  perFinding: {},
  finalFindings: [],
  summary: null,
  summaryError: null,
  criticErrors: [],
});

describe("reviewer node", () => {
  it("returns draftFindings on success and forwards focus to adapter", async () => {
    setCtx("rr-success", { diffs: [], guidelines: "g", projectContext: "p" });
    let receivedFocus: string | undefined;
    const adapter: AiAdapter = {
      generateReviewFindings: async (ctx) => {
        receivedFocus = ctx.focus;
        return { findings: [fakeFinding()] };
      },
      generateReviewSummary: async () => ({ summary: {} as never }),
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => fakeFinding(),
    };
    const node = makeReviewerNode("quality", adapter);
    const result = await node(baseState("rr-success"));
    assert.equal(result.draftFindings!.length, 1);
    assert.equal(receivedFocus, "quality");
    clearCtx("rr-success");
  });

  it("returns reviewerErrors when adapter throws", async () => {
    setCtx("rr-throw", { diffs: [], guidelines: "", projectContext: "" });
    const adapter: AiAdapter = {
      generateReviewFindings: async () => {
        throw new Error("API down");
      },
      generateReviewSummary: async () => ({ summary: {} as never }),
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => fakeFinding(),
    };
    const node = makeReviewerNode("security", adapter);
    const result = await node(baseState("rr-throw"));
    assert.equal(result.draftFindings, undefined);
    assert.equal(result.reviewerErrors![0]!.role, "security");
    assert.match(result.reviewerErrors![0]!.error, /API down/);
    clearCtx("rr-throw");
  });

  it("logs ctx-cache miss as error when reviewRunId not set", async () => {
    const adapter: AiAdapter = {
      generateReviewFindings: async () => ({ findings: [] }),
      generateReviewSummary: async () => ({ summary: {} as never }),
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => fakeFinding(),
    };
    const node = makeReviewerNode("quality", adapter);
    const result = await node(baseState("missing"));
    assert.match(result.reviewerErrors![0]!.error, /ctx-cache miss/);
  });

  it("filters out findings below confidenceThreshold", async () => {
    setCtx("rr-filter", { diffs: [], guidelines: "", projectContext: "" });
    const adapter: AiAdapter = {
      generateReviewFindings: async () => ({
        findings: [
          fakeFinding({ confidenceScore: 0.9, title_en: "keep" }),
          fakeFinding({ confidenceScore: 0.5, title_en: "drop" }),
          fakeFinding({ confidenceScore: 0.81, title_en: "keep-edge" }),
        ],
      }),
      generateReviewSummary: async () => ({ summary: {} as never }),
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => fakeFinding(),
    };
    const node = makeReviewerNode("quality", adapter, {
      confidenceThreshold: 0.8,
    });
    const result = await node(baseState("rr-filter"));
    assert.equal(result.draftFindings!.length, 2);
    assert.equal(result.draftFindings![0]!.title_en, "keep");
    assert.equal(result.draftFindings![1]!.title_en, "keep-edge");
    clearCtx("rr-filter");
  });

  it("keeps all findings when confidenceThreshold is 0", async () => {
    setCtx("rr-nofilter", { diffs: [], guidelines: "", projectContext: "" });
    const adapter: AiAdapter = {
      generateReviewFindings: async () => ({
        findings: [
          fakeFinding({ confidenceScore: 0.1, title_en: "low" }),
          fakeFinding({ confidenceScore: 0.9, title_en: "high" }),
        ],
      }),
      generateReviewSummary: async () => ({ summary: {} as never }),
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => fakeFinding(),
    };
    const node = makeReviewerNode("quality", adapter);
    const result = await node(baseState("rr-nofilter"));
    assert.equal(result.draftFindings!.length, 2);
    clearCtx("rr-nofilter");
  });

  it("calls preScanContextFn and injects result into guidelines", async () => {
    setCtx("rr-prescan", {
      diffs: [],
      guidelines: "original-guidelines",
      projectContext: "",
    });
    let receivedGuidelines: string | undefined;
    const adapter: AiAdapter = {
      generateReviewFindings: async (ctx) => {
        receivedGuidelines = ctx.guidelines;
        return { findings: [] };
      },
      generateReviewSummary: async () => ({ summary: {} as never }),
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => fakeFinding(),
    };
    const node = makeReviewerNode("error_handling", adapter, {
      preScanContextFn: () => "<pre_scan>found patterns</pre_scan>",
    });
    await node(baseState("rr-prescan"));
    assert.ok(
      receivedGuidelines!.includes("<pre_scan>found patterns</pre_scan>"),
      "Expected pre-scan output prepended to guidelines"
    );
    assert.ok(
      receivedGuidelines!.includes("original-guidelines"),
      "Expected original guidelines preserved"
    );
    clearCtx("rr-prescan");
  });
});
