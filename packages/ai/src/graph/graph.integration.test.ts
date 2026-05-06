import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MemorySaver } from "@langchain/langgraph";

import { buildReviewGraph } from "./index.js";
import { setCtx, clearCtx } from "./ctx-cache.js";
import type { AiAdapter } from "../adapter.js";
import type {
  CritiqueResult,
  ReviewContext,
  ReviewFinding,
  ReviewSummary,
} from "../types.js";

const f = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
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
  ...over,
});

const sampleSummary: ReviewSummary = {
  summaryMd_en: "ok",
  summaryMd_zh: "ok",
  highlights_en: [],
  highlights_zh: [],
  mermaid_flow: "",
};

const baseInitial = (rrId: string) => ({
  reviewRunId: rrId,
  context: {
    fullName: "owner/repo",
    prNumber: 1,
    headSha: "h",
    organizationId: "o",
    repositoryId: "r",
    pullRequestId: "p",
    reviewRunId: rrId,
    providerConfigId: "pc",
  },
});

describe("review graph end-to-end (MemorySaver)", () => {
  beforeEach(() => {
    setCtx("rr-A", { diffs: [], guidelines: "", projectContext: "" });
    setCtx("rr-B", { diffs: [], guidelines: "", projectContext: "" });
    setCtx("rr-C", { diffs: [], guidelines: "", projectContext: "" });
    setCtx("rr-D", { diffs: [], guidelines: "", projectContext: "" });
  });
  afterEach(() => {
    clearCtx("rr-A");
    clearCtx("rr-B");
    clearCtx("rr-C");
    clearCtx("rr-D");
  });

  it("Scenario A: all findings approved on first critic", async () => {
    const adapter: AiAdapter = {
      generateReviewFindings: async (ctx: ReviewContext) => {
        if (ctx.focus === "quality")
          return { findings: [f({ title_en: "Q1", confidenceScore: 0.9 })] };
        if (ctx.focus === "security")
          return { findings: [f({ title_en: "S1", issueType: "security" })] };
        // error_handling — no findings for this scenario
        return { findings: [] };
      },
      verifyFinding: async (): Promise<CritiqueResult> => ({
        valid: true,
        reason: "ok",
        confidenceScore: 0.9,
      }),
      regenerateFinding: async () => {
        throw new Error("regenerator should not be called in scenario A");
      },
      generateReviewSummary: async () => ({ summary: sampleSummary }),
    };

    const graph = buildReviewGraph(adapter, new MemorySaver());
    const out = await graph.invoke(baseInitial("rr-A"), {
      configurable: { thread_id: "rr-A" },
    });

    assert.equal(out.finalFindings.length, 2);
    assert.ok(out.summary);
    assert.equal(out.summary?.summaryMd_en, "ok");
    for (const ps of Object.values(out.perFinding)) {
      assert.equal(ps.status, "approved");
      assert.equal(ps.attempts, 0);
    }
  });

  it("Scenario B: 1 finding fixed on second critic (reflection loop closes)", async () => {
    let verifyCallCount = 0;
    const adapter: AiAdapter = {
      generateReviewFindings: async () => ({ findings: [f({ title_en: "X" })] }),
      verifyFinding: async (finding): Promise<CritiqueResult> => {
        verifyCallCount++;
        // 第一次 invalid，让 router 派 regenerator；第二次（被 regenerator 改过的版本）valid
        if (finding.startLine === 1) {
          return { valid: false, reason: "wrong line", confidenceScore: 0.6 };
        }
        return { valid: true, reason: "ok", confidenceScore: 0.95 };
      },
      regenerateFinding: async (orig) => ({ ...orig, startLine: 5, endLine: 5 }),
      generateReviewSummary: async () => ({ summary: sampleSummary }),
    };

    const graph = buildReviewGraph(adapter, new MemorySaver());
    const out = await graph.invoke(baseInitial("rr-B"), {
      configurable: { thread_id: "rr-B" },
    });

    // quality+security 都返回 X，aggregator 去重 → 1 条
    assert.equal(out.finalFindings.length, 1);
    // regenerator 改过的版本（startLine=5）
    assert.equal(out.finalFindings[0]!.startLine, 5);
    // critic 至少跑了两次
    assert.ok(verifyCallCount >= 2, `verifyCallCount=${verifyCallCount}`);
    // 最终 status=approved
    for (const ps of Object.values(out.perFinding)) {
      assert.equal(ps.status, "approved");
    }
  });

  it("Scenario C: exhaust attempts → fall back to patchedFinding", async () => {
    const adapter: AiAdapter = {
      generateReviewFindings: async () => ({ findings: [f({ title_en: "X" })] }),
      verifyFinding: async (finding): Promise<CritiqueResult> => ({
        valid: false,
        reason: "still wrong",
        confidenceScore: 0.5,
        patchedFinding: { ...finding, title_en: "X-PATCHED" },
      }),
      regenerateFinding: async (orig) => orig, // 不变化，让 critic 仍判 invalid
      generateReviewSummary: async () => ({ summary: sampleSummary }),
    };

    const graph = buildReviewGraph(adapter, new MemorySaver());
    const out = await graph.invoke(baseInitial("rr-C"), {
      configurable: { thread_id: "rr-C" },
    });

    assert.equal(out.finalFindings.length, 1);
    assert.equal(out.finalFindings[0]!.title_en, "X-PATCHED");
    for (const ps of Object.values(out.perFinding)) {
      assert.equal(ps.status, "exhausted");
    }
  });

  it("Scenario D: three reviewers (quality+security+error_handler) aggregate correctly", async () => {
    const adapter: AiAdapter = {
      generateReviewFindings: async (ctx) => {
        if (ctx.focus === "quality")
          return { findings: [f({ title_en: "Q1", confidenceScore: 0.9 })] };
        if (ctx.focus === "security")
          return {
            findings: [
              f({
                title_en: "S1",
                filePath: "b.ts",
                issueType: "security",
              }),
            ],
          };
        // error_handling
        return {
          findings: [
            f({
              title_en: "E1",
              filePath: "c.ts",
              issueType: "error_handling" as never,
              confidenceScore: 0.85,
            }),
          ],
        };
      },
      verifyFinding: async (): Promise<CritiqueResult> => ({
        valid: true,
        reason: "ok",
        confidenceScore: 0.9,
      }),
      regenerateFinding: async () => {
        throw new Error("regenerator should not be called");
      },
      generateReviewSummary: async () => ({ summary: sampleSummary }),
    };

    const graph = buildReviewGraph(adapter, new MemorySaver());
    const out = await graph.invoke(baseInitial("rr-D"), {
      configurable: { thread_id: "rr-D" },
    });

    assert.equal(out.finalFindings.length, 3);
    // All three issueTypes should appear
    const types = out.finalFindings.map((f) => f.issueType).sort();
    assert.deepEqual(types, ["error_handling", "quality", "security"]);
  });
});
