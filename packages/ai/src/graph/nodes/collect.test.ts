import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { collectFindings } from "./collect.js";
import type { ReviewFinding } from "../../types.js";
import type { ReviewGraphStateType } from "../state.js";

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

const stateWith = (perFinding: ReviewGraphStateType["perFinding"]): ReviewGraphStateType => ({
  reviewRunId: "rr",
  outputLanguage: "en-US",
  context: {} as never,
  draftFindings: [],
  reviewerErrors: [],
  aggregatedFindings: [],
  perFinding,
  finalFindings: [],
  summary: null,
  summaryError: null,
  criticErrors: [],
});

describe("collect_findings", () => {
  it("approved entries appear with their current finding", async () => {
    const out = await collectFindings(
      stateWith({
        k1: { finding: f({ title_en: "OK" }), attempts: 0, lastCritique: null, status: "approved" },
      })
    );
    assert.equal(out.finalFindings!.length, 1);
    assert.equal(out.finalFindings![0]!.title_en, "OK");
  });

  it("exhausted with patchedFinding falls back to patched", async () => {
    const out = await collectFindings(
      stateWith({
        k1: {
          finding: f({ title_en: "DRAFT" }),
          attempts: 1,
          lastCritique: {
            valid: false,
            reason: "x",
            confidenceScore: 0.4,
            patchedFinding: f({ title_en: "PATCHED" }),
          },
          status: "exhausted",
        },
      })
    );
    assert.equal(out.finalFindings![0]!.title_en, "PATCHED");
  });

  it("exhausted without patchedFinding keeps the current finding", async () => {
    const out = await collectFindings(
      stateWith({
        k1: {
          finding: f({ title_en: "KEEP" }),
          attempts: 1,
          lastCritique: { valid: false, reason: "x", confidenceScore: 0.4 },
          status: "exhausted",
        },
      })
    );
    assert.equal(out.finalFindings![0]!.title_en, "KEEP");
  });

  it("pending entries are dropped from finalFindings", async () => {
    const out = await collectFindings(
      stateWith({
        k1: { finding: f({ title_en: "P" }), attempts: 0, lastCritique: null, status: "pending" },
        k2: { finding: f({ title_en: "A" }), attempts: 0, lastCritique: null, status: "approved" },
      })
    );
    assert.equal(out.finalFindings!.length, 1);
    assert.equal(out.finalFindings![0]!.title_en, "A");
  });

  it("empty perFinding → empty finalFindings", async () => {
    const out = await collectFindings(stateWith({}));
    assert.deepEqual(out.finalFindings, []);
  });
});
