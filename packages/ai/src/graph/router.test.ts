import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Send } from "@langchain/langgraph";

import { fanOutFindings, MAX_REFLECTION_ATTEMPTS } from "./router.js";
import type { PerFindingState, ReviewGraphStateType } from "./state.js";
import type { ReviewFinding } from "../types.js";

const f: ReviewFinding = {
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

const stateWith = (
  perFinding: Record<string, PerFindingState>
): ReviewGraphStateType => ({
  reviewRunId: "rr",
  context: {
    fullName: "o/r",
    prNumber: 1,
    headSha: "h",
    organizationId: "o",
    repositoryId: "r",
    pullRequestId: "p",
    reviewRunId: "rr",
    providerConfigId: "pc",
  },
  draftFindings: [],
  reviewerErrors: [],
  aggregatedFindings: [],
  perFinding,
  finalFindings: [],
  summary: null,
});

describe("MAX_REFLECTION_ATTEMPTS", () => {
  it("equals 2", () => {
    assert.equal(MAX_REFLECTION_ATTEMPTS, 2);
  });
});

describe("fanOutFindings", () => {
  it("returns 'collect_findings' when no pending", () => {
    const out = fanOutFindings(stateWith({}));
    assert.equal(out, "collect_findings");
  });

  it("returns Send[] of length=N for N pending findings", () => {
    const out = fanOutFindings(
      stateWith({
        k1: { finding: f, attempts: 0, lastCritique: null, status: "pending" },
        k2: { finding: f, attempts: 0, lastCritique: null, status: "pending" },
        k3: { finding: f, attempts: 0, lastCritique: null, status: "approved" },
      })
    );
    assert.ok(Array.isArray(out));
    assert.equal((out as Send[]).length, 2);
    assert.ok((out as Send[])[0] instanceof Send);
  });

  it("Send.node is 'critic' and payload has findingKey + reviewRunId", () => {
    const out = fanOutFindings(
      stateWith({
        k1: { finding: f, attempts: 0, lastCritique: null, status: "pending" },
      })
    );
    const send = (out as Send[])[0]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal((send as any).node, "critic");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal((send as any).args.findingKey, "k1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal((send as any).args.reviewRunId, "rr");
  });
});
