import type { FileDiff } from "@reviewer/git";

export interface ReviewContext {
  fullName: string;            // 仓库 full_name，如 "owner/repo"
  prNumber: number;
  headSha: string;
  diffs: FileDiff[];
  guidelines?: string;         // reviewer 自身规范（CLAUDE.md/AGENTS.md/...）
  projectContext?: string;     // 目标仓库背景（同名 4 文件）
}

export interface ReviewFinding {
  filePath: string;
  startLine: number;
  endLine: number;
  side: "LEFT" | "RIGHT";
  issueType: "quality" | "security";
  severity: "low" | "medium" | "high" | "critical";
  title_en: string;
  title_zh: string;
  summary_en: string;
  summary_zh: string;
  suggestion_en: string;
  suggestion_zh: string;
  confidenceScore: number;
}

export interface ReviewResult {
  findings: ReviewFinding[];
}

export interface ReviewSummary {
  summaryMd_en: string;
  summaryMd_zh: string;
  highlights_en: string[];
  highlights_zh: string[];
  mermaid_flow: string;
}

export interface ReviewSummaryResult {
  summary: ReviewSummary;
}
