import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { makeSummarizerNode } from "./summarizer.js";
import { setCtx, clearCtx } from "../ctx-cache.js";
import type { AiAdapter } from "../../adapter.js";
import type { ReviewSummary } from "../../types.js";
import type { ReviewGraphStateType } from "../state.js";

const summary: ReviewSummary = {
  summaryMd_en: "EN",
  summaryMd_zh: "ZH",
  highlights_en: ["a"],
  highlights_zh: ["甲"],
  mermaid_flow: "",
};

const baseState = (id = "rr"): ReviewGraphStateType => ({
  reviewRunId: id,
  context: {
    fullName: "o/r",
    prNumber: 1,
    headSha: "h",
    organizationId: "o",
    repositoryId: "r",
    pullRequestId: "p",
    reviewRunId: id,
    providerConfigId: "pc",
  },
  draftFindings: [],
  reviewerErrors: [],
  aggregatedFindings: [],
  perFinding: {},
  finalFindings: [],
  summary: null,
});

describe("summarizer node", () => {
  it("returns summary on success and forwards finalFindings to adapter", async () => {
    setCtx("rr-s", { diffs: [], guidelines: "", projectContext: "" });
    let receivedFinal: number | undefined;
    const adapter: AiAdapter = {
      generateReviewFindings: async () => ({ findings: [] }),
      generateReviewSummary: async (ctx) => {
        receivedFinal = ctx.finalFindings?.length;
        return { summary };
      },
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () =>
        ({ filePath: "x" } as never),
    };
    const node = makeSummarizerNode(adapter);
    const out = await node({ ...baseState("rr-s"), finalFindings: [{} as never] });
    assert.equal(out.summary?.summaryMd_en, "EN");
    assert.equal(receivedFinal, 1);
    clearCtx("rr-s");
  });

  it("returns summary=null on adapter throw (warn-and-continue)", async () => {
    setCtx("rr-s", { diffs: [], guidelines: "", projectContext: "" });
    const adapter: AiAdapter = {
      generateReviewFindings: async () => ({ findings: [] }),
      generateReviewSummary: async () => {
        throw new Error("API down");
      },
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => ({ filePath: "x" } as never),
    };
    const node = makeSummarizerNode(adapter);
    const out = await node(baseState("rr-s"));
    assert.equal(out.summary, null);
    clearCtx("rr-s");
  });

  it("returns summary=null on ctx-cache miss", async () => {
    const adapter: AiAdapter = {
      generateReviewFindings: async () => ({ findings: [] }),
      generateReviewSummary: async () => ({ summary }),
      verifyFinding: async () => ({ valid: true, reason: "", confidenceScore: 1 }),
      regenerateFinding: async () => ({ filePath: "x" } as never),
    };
    const node = makeSummarizerNode(adapter);
    const out = await node(baseState("missing"));
    assert.equal(out.summary, null);
  });
});
