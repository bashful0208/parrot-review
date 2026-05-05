import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { _internalForTest } from "./adapter.js";
import type { ReviewContext, ReviewFinding } from "./types.js";

const baseCtx: ReviewContext = {
  fullName: "owner/repo",
  prNumber: 1,
  headSha: "sha",
  diffs: [],
  guidelines: "",
  projectContext: "",
  organizationId: "o",
  repositoryId: "r",
  pullRequestId: "p",
  reviewRunId: "rr",
  providerConfigId: "pc",
};

describe("buildUserMessage with focus", () => {
  it("focus=quality narrows scope to quality and excludes security", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, focus: "quality" },
      "DIFF"
    );
    assert.match(msg, /quality/i);
    assert.match(msg, /Do NOT report security/i);
  });

  it("focus=security narrows scope to security and excludes quality", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, focus: "security" },
      "DIFF"
    );
    assert.match(msg, /security/i);
    assert.match(msg, /Do NOT report style or quality/i);
  });

  it("no focus keeps existing comprehensive prompt (no Scope: line)", () => {
    const msg = _internalForTest.buildUserMessage(baseCtx, "DIFF");
    assert.match(msg, /report_findings/);
    assert.doesNotMatch(msg, /^Scope:/m);
  });
});

describe("buildSummaryUserMessage with finalFindings", () => {
  const sampleFinding: ReviewFinding = {
    filePath: "auth.ts",
    startLine: 12,
    endLine: 14,
    side: "RIGHT",
    issueType: "security",
    severity: "high",
    title_en: "SQL injection in login",
    title_zh: "登录处的 SQL 注入",
    summary_en: "",
    summary_zh: "",
    suggestion_en: "",
    suggestion_zh: "",
    aiPrompt: "",
    confidenceScore: 0.8,
  };

  it("embeds verified_findings block when finalFindings provided and non-empty", () => {
    const msg = _internalForTest.buildSummaryUserMessage(
      { ...baseCtx, finalFindings: [sampleFinding] },
      "DIFF"
    );
    assert.match(msg, /<verified_findings>/);
    assert.match(msg, /SQL injection in login/);
    assert.match(msg, /auth\.ts/);
  });

  it("skips block when finalFindings absent", () => {
    const msg = _internalForTest.buildSummaryUserMessage(baseCtx, "DIFF");
    assert.doesNotMatch(msg, /<verified_findings>/);
  });

  it("skips block when finalFindings is empty array", () => {
    const msg = _internalForTest.buildSummaryUserMessage(
      { ...baseCtx, finalFindings: [] },
      "DIFF"
    );
    assert.doesNotMatch(msg, /<verified_findings>/);
  });
});
