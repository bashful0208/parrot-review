import type { FileDiff } from "@reviewer/git";

/** Reviewer 节点的 prompt scope；不传则保持原有综合扫描行为。 */
export type ReviewFocus = "quality" | "security" | "error_handling";

export interface ReviewContext {
  fullName: string;            // 仓库 full_name，如 "owner/repo"
  prNumber: number;
  headSha: string;
  diffs: FileDiff[];
  guidelines?: string;         // reviewer 自身规范（CLAUDE.md/AGENTS.md/...）
  projectContext?: string;     // 目标仓库背景（同名 4 文件）
  // 调用治理 / usage_events FK —— 由 worker 在构造时填入
  organizationId: string;
  repositoryId?: string | null;
  pullRequestId?: string | null;
  reviewRunId?: string | null;
  providerConfigId?: string | null;
  /** 限定 reviewer 只看某一类问题；不传则像旧逻辑一样综合扫描。 */
  focus?: ReviewFocus;
  /** summarizer 跑在 critic 之后时，注入过滤后的最终 findings 让 summary 反映真实问题清单。 */
  finalFindings?: ReviewFinding[];
}

export interface ReviewFinding {
  filePath: string;
  startLine: number;
  endLine: number;
  side: "LEFT" | "RIGHT";
  issueType: "quality" | "security" | "error_handling";
  severity: "low" | "medium" | "high" | "critical";
  title_en: string;
  title_zh: string;
  summary_en: string;
  summary_zh: string;
  suggestion_en: string;
  suggestion_zh: string;
  /** Detailed, copy-pasteable English instruction for AI coding agents
   * (Cursor / Claude Code / etc.) to apply the fix end-to-end. */
  aiPrompt: string;
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

export interface CritiqueResult {
  /** finding 是否可以接受发布。 */
  valid: boolean;
  /** 不通过原因 / 补充说明，单语英文，落 metadata 用。 */
  reason: string;
  /** critic 给出的修正版本；exhausted 时由 collect_findings 兜底使用。 */
  patchedFinding?: ReviewFinding;
  /** 0~1。critic 对自己判断的置信度。 */
  confidenceScore: number;
}
