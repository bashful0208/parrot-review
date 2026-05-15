import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FallbackAdapter } from "./adapter.js";
import type { AiAdapter } from "./adapter.js";
import type { ReviewContext, ReviewResult, ReviewSummaryResult, CritiqueResult, ReviewFinding } from "./types.js";

function mockAdapter(overrides: Partial<AiAdapter> = {}): AiAdapter {
  return {
    generateReviewFindings: async () => ({ findings: [] }),
    generateReviewSummary: async () => ({ summary: { summaryMd_en: "", summaryMd_zh: "", highlights_en: [], highlights_zh: [], mermaid_flow: "" } }),
    verifyFinding: async () => ({ valid: true, reason: "ok", confidenceScore: 1 }),
    regenerateFinding: async (f) => f,
    ...overrides,
  };
}

function makeContext(): ReviewContext {
  return {
    fullName: "o/r",
    prNumber: 1,
    headSha: "abc",
    organizationId: "org1",
    repositoryId: "repo1",
    pullRequestId: "pr1",
    reviewRunId: "run1",
    providerConfigId: "pc1",
    outputLanguage: "en-US",
    diffs: [],
    finalFindings: [],
  };
}

describe("FallbackAdapter", () => {
  it("uses primary when primary succeeds", async () => {
    let primaryCalled = false;
    const primary = mockAdapter({
      generateReviewFindings: async () => {
        primaryCalled = true;
        return { findings: [] };
      },
    });
    const fallback = mockAdapter();
    const adapter = new FallbackAdapter(primary, [fallback]);
    await adapter.generateReviewFindings(makeContext());
    assert.equal(primaryCalled, true);
  });

  it("falls back on timeout error", async () => {
    let fallbackCalled = false;
    const primary = mockAdapter({
      generateReviewFindings: async () => {
        const err = new Error("timeout");
        (err as any).code = "MODEL_INVOCATION_TIMEOUT";
        throw err;
      },
    });
    const fallback = mockAdapter({
      generateReviewFindings: async () => {
        fallbackCalled = true;
        return { findings: [] };
      },
    });
    const adapter = new FallbackAdapter(primary, [fallback]);
    await adapter.generateReviewFindings(makeContext());
    assert.equal(fallbackCalled, true);
  });

  it("falls back on provider unavailable", async () => {
    let fallbackCalled = false;
    const primary = mockAdapter({
      generateReviewSummary: async () => {
        const err = new Error("503 Service Unavailable");
        (err as any).code = "MODEL_INVOCATION_PROVIDER_UNAVAILABLE";
        throw err;
      },
    });
    const fallback = mockAdapter({
      generateReviewSummary: async () => {
        fallbackCalled = true;
        return { summary: { summaryMd_en: "ok", summaryMd_zh: "", highlights_en: [], highlights_zh: [], mermaid_flow: "" } };
      },
    });
    const adapter = new FallbackAdapter(primary, [fallback]);
    await adapter.generateReviewSummary(makeContext());
    assert.equal(fallbackCalled, true);
  });

  it("throws when both primary and fallback fail", async () => {
    const primary = mockAdapter({
      generateReviewFindings: async () => {
        const err = new Error("timeout");
        (err as any).code = "MODEL_INVOCATION_TIMEOUT";
        throw err;
      },
    });
    const fallback = mockAdapter({
      generateReviewFindings: async () => {
        throw new Error("fallback also failed");
      },
    });
    const adapter = new FallbackAdapter(primary, [fallback]);
    await assert.rejects(
      () => adapter.generateReviewFindings(makeContext()),
      { message: "fallback also failed" }
    );
  });

  it("does not fallback on non-retryable error", async () => {
    const primary = mockAdapter({
      generateReviewFindings: async () => {
        throw new Error("invalid API key");
      },
    });
    const fallback = mockAdapter();
    const adapter = new FallbackAdapter(primary, [fallback]);
    await assert.rejects(
      () => adapter.generateReviewFindings(makeContext()),
      { message: "invalid API key" }
    );
  });

  it("works with no fallbacks configured", async () => {
    const primary = mockAdapter();
    const adapter = new FallbackAdapter(primary, []);
    const result = await adapter.generateReviewFindings(makeContext());
    assert.deepEqual(result, { findings: [] });
  });
});
