import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregator, findingKey } from "./aggregator.js";
import type { ReviewFinding } from "../../types.js";
import type { ReviewGraphStateType, ReviewContextRef } from "../state.js";

const baseFinding: Omit<ReviewFinding, "filePath" | "startLine" | "endLine" | "severity" | "title_en"> = {
  side: "RIGHT",
  issueType: "quality",
  title_zh: "标",
  summary_en: "s",
  summary_zh: "总",
  suggestion_en: "g",
  suggestion_zh: "建",
  aiPrompt: "p",
  confidenceScore: 0.5,
};

const ctxRef: ReviewContextRef = {
  fullName: "owner/repo",
  prNumber: 1,
  headSha: "h",
  organizationId: "o",
  repositoryId: "r",
  pullRequestId: "p",
  reviewRunId: "rr",
  providerConfigId: "pc",
  outputLanguage: "en-US",
};

const baseState = (draftFindings: ReviewFinding[]): ReviewGraphStateType => ({
  reviewRunId: "rr",
  outputLanguage: "en-US",
  context: ctxRef,
  draftFindings,
  reviewerErrors: [],
  aggregatedFindings: [],
  perFinding: {},
  finalFindings: [],
  summary: null,
  summaryError: null,
  criticErrors: [],
});

describe("aggregator", () => {
  it("dedupes findings with same fingerprint", async () => {
    const f1: ReviewFinding = {
      ...baseFinding,
      filePath: "a.ts",
      startLine: 1,
      endLine: 1,
      severity: "high",
      title_en: "X",
    };
    const result = await aggregator(baseState([f1, { ...f1 }]));
    assert.equal(result.aggregatedFindings!.length, 1);
    assert.equal(Object.keys(result.perFinding!).length, 1);
  });

  it("sorts by severity (critical first)", async () => {
    const result = await aggregator(
      baseState([
        {
          ...baseFinding,
          filePath: "a.ts",
          startLine: 1,
          endLine: 1,
          severity: "low",
          title_en: "L",
        },
        {
          ...baseFinding,
          filePath: "a.ts",
          startLine: 2,
          endLine: 2,
          severity: "critical",
          title_en: "C",
        },
        {
          ...baseFinding,
          filePath: "a.ts",
          startLine: 3,
          endLine: 3,
          severity: "high",
          title_en: "H",
        },
      ])
    );
    assert.deepEqual(
      result.aggregatedFindings!.map((f) => f.severity),
      ["critical", "high", "low"]
    );
  });

  it("breaks tie by filePath (lex asc)", async () => {
    const result = await aggregator(
      baseState([
        {
          ...baseFinding,
          filePath: "z.ts",
          startLine: 1,
          endLine: 1,
          severity: "high",
          title_en: "Z",
        },
        {
          ...baseFinding,
          filePath: "a.ts",
          startLine: 1,
          endLine: 1,
          severity: "high",
          title_en: "A",
        },
      ])
    );
    assert.equal(result.aggregatedFindings![0]!.filePath, "a.ts");
  });

  it("initializes perFinding to status=pending, attempts=0, lastCritique=null", async () => {
    const result = await aggregator(
      baseState([
        {
          ...baseFinding,
          filePath: "a.ts",
          startLine: 1,
          endLine: 1,
          severity: "low",
          title_en: "X",
        },
      ])
    );
    const entry = Object.values(result.perFinding!)[0]!;
    assert.equal(entry.status, "pending");
    assert.equal(entry.attempts, 0);
    assert.equal(entry.lastCritique, null);
  });

  it("findingKey is deterministic and respects repositoryId", () => {
    const f: ReviewFinding = {
      ...baseFinding,
      filePath: "a.ts",
      startLine: 1,
      endLine: 1,
      severity: "low",
      title_en: "X",
    };
    assert.equal(findingKey("r", f), findingKey("r", f));
    assert.notEqual(findingKey("r1", f), findingKey("r2", f));
  });

  it("empty draftFindings → empty aggregatedFindings + empty perFinding", async () => {
    const result = await aggregator(baseState([]));
    assert.deepEqual(result.aggregatedFindings, []);
    assert.deepEqual(result.perFinding, {});
  });
});
