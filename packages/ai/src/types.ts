import type { FileDiff } from "@reviewer/git";

export interface ReviewContext {
  fullName: string;      // 仓库 full_name，如 "owner/repo"
  prNumber: number;
  headSha: string;
  diffs: FileDiff[];
}

export interface ReviewFinding {
  filePath: string;
  startLine: number;
  endLine: number;
  side: "LEFT" | "RIGHT";   // RIGHT = 新代码
  issueType: "quality" | "security";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;           // 问题描述
  suggestion: string;        // 修复建议
  confidenceScore: number;   // 0.0–1.0
}

export interface ReviewResult {
  findings: ReviewFinding[];
}

export interface ReviewSummary {
  summaryMd: string;
  highlights: string[];
}

export interface ReviewSummaryResult {
  summary: ReviewSummary;
}
