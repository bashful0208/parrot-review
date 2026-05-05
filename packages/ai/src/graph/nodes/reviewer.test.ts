import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { makeReviewerNode } from "./reviewer.js";
import { setCtx, clearCtx } from "../ctx-cache.js";
import type { AiAdapter } from "../../adapter.js";
import type { ReviewFinding } from "../../types.js";
import type { ReviewGraphStateType } from "../state.js";

const fakeFinding: ReviewFinding = {
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
};

const baseState = (reviewRunId = "rr"): ReviewGraphStateType => ({
  reviewRunId,
  context: {
    fullName: "o/r",
    prNumber: 1,
    headSha: "h",
    organizationId: "o",
    repositoryId: "r",
    pullRequestId: "p",
    reviewRunId,
    providerConfigId: "pc",
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
        return { findings: [fakeFinding] };
      },
      generateReviewSummary: async () => ({ summary: {} as never }),
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => fakeFinding,
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
      regenerateFinding: async () => fakeFinding,
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
      regenerateFinding: async () => fakeFinding,
    };
    const node = makeReviewerNode("quality", adapter);
    const result = await node(baseState("missing"));
    assert.match(result.reviewerErrors![0]!.error, /ctx-cache miss/);
  });
});
