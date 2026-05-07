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

  it("focus=quality includes confidence threshold >= 0.80 instruction", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, focus: "quality" },
      "DIFF"
    );
    assert.match(msg, /confidenceScore >= 0\.80/);
  });

  it("focus=security narrows scope to security and excludes quality", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, focus: "security" },
      "DIFF"
    );
    assert.match(msg, /security/i);
    assert.match(msg, /Do NOT report style or quality/i);
  });

  it("focus=error_handling narrows scope to error handling issues", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, focus: "error_handling" },
      "DIFF"
    );
    assert.match(msg, /error handling/i);
    assert.match(msg, /empty catch blocks/i);
    assert.match(msg, /orphaned resources/i);
    assert.match(msg, /issueType='error_handling'/);
  });

  it("no focus keeps existing comprehensive prompt (no Scope: line)", () => {
    const msg = _internalForTest.buildUserMessage(baseCtx, "DIFF");
    assert.match(msg, /report_findings/);
    assert.doesNotMatch(msg, /^Scope:/m);
  });
});

describe("buildUserMessage with guidelines and project context", () => {
  it("includes guidelines block when guidelines is non-empty", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, guidelines: "Use createLogger() not console.log" },
      "DIFF"
    );
    assert.match(msg, /<reviewer_guidelines>/);
    assert.match(msg, /createLogger/);
    assert.match(msg, /<\/reviewer_guidelines>/);
  });

  it("skips guidelines block when guidelines is empty", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, guidelines: "" },
      "DIFF"
    );
    assert.doesNotMatch(msg, /<reviewer_guidelines>/);
  });

  it("includes project context block when non-empty", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, projectContext: "This is a Next.js app with Prisma" },
      "DIFF"
    );
    assert.match(msg, /<project_context>/);
    assert.match(msg, /Next\.js/);
    assert.match(msg, /<\/project_context>/);
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
