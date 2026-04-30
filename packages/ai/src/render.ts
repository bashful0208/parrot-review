import type { ReviewFinding, ReviewSummary } from "./types.js";

export function renderBilingualSummary(summary: ReviewSummary): string {
  const sections: string[] = [];

  const enParts = ["## Summary", summary.summaryMd_en.trim()];
  if (summary.highlights_en.length > 0) {
    enParts.push(
      "**Highlights:**\n" + summary.highlights_en.map((h) => `- ${h}`).join("\n")
    );
  }
  sections.push(enParts.join("\n\n"));

  const zhParts = ["## 摘要", summary.summaryMd_zh.trim()];
  if (summary.highlights_zh.length > 0) {
    zhParts.push(
      "**关键变更:**\n" + summary.highlights_zh.map((h) => `- ${h}`).join("\n")
    );
  }
  sections.push(zhParts.join("\n\n"));

  const mermaid = summary.mermaid_flow.trim();
  if (mermaid !== "") {
    sections.push(`## Flow / 流程\n\n${mermaid}`);
  }

  return sections.join("\n\n---\n\n");
}

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim() !== "";
}

const ISSUE_TYPE_BADGE: Record<
  ReviewFinding["issueType"],
  { icon: string; label: string }
> = {
  quality: { icon: "⚠️", label: "Potential issue" },
  security: { icon: "🛡️", label: "Security issue" },
};

const SEVERITY_BADGE: Record<
  ReviewFinding["severity"],
  { icon: string; label: string }
> = {
  low: { icon: "🟡", label: "Minor" },
  medium: { icon: "🟠", label: "Moderate" },
  high: { icon: "🔴", label: "Major" },
  critical: { icon: "🚨", label: "Critical" },
};

function formatFindingBadge(finding: ReviewFinding): string {
  const type =
    ISSUE_TYPE_BADGE[finding.issueType] ?? ISSUE_TYPE_BADGE.quality;
  const sev = SEVERITY_BADGE[finding.severity] ?? SEVERITY_BADGE.low;
  return `${type.icon} ${type.label} | ${sev.icon} ${sev.label}`;
}

export function renderBilingualFinding(finding: ReviewFinding): string {
  const blocks: string[] = [];

  if (nonEmpty(finding.title_en) && nonEmpty(finding.summary_en)) {
    const lines = [`**${finding.title_en.trim()}**`, "", finding.summary_en.trim()];
    if (nonEmpty(finding.suggestion_en)) {
      lines.push("", `**Suggestion:** ${finding.suggestion_en.trim()}`);
    }
    blocks.push(lines.join("\n"));
  }

  if (nonEmpty(finding.title_zh) && nonEmpty(finding.summary_zh)) {
    const lines = [`**${finding.title_zh.trim()}**`, "", finding.summary_zh.trim()];
    if (nonEmpty(finding.suggestion_zh)) {
      lines.push("", `**建议：** ${finding.suggestion_zh.trim()}`);
    }
    blocks.push(lines.join("\n"));
  }

  if (blocks.length === 0) return "";
  return `${formatFindingBadge(finding)}\n\n${blocks.join("\n\n---\n\n")}`;
}
