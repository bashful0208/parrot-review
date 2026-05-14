import type { OutputLanguage, ReviewFinding, ReviewSummary } from "./types.js";

export function renderSummary(
  summary: ReviewSummary,
  language: OutputLanguage
): string {
  const sections: string[] = [];

  if (language === "zh-CN") {
    const zhParts = ["## 摘要", (summary.summaryMd_zh || "").trim()];
    if (summary.highlights_zh.length > 0) {
      zhParts.push(
        "**关键变更:**\n" + summary.highlights_zh.map((h) => `- ${h}`).join("\n")
      );
    }
    sections.push(zhParts.join("\n\n"));
  } else {
    const enParts = ["## Summary", (summary.summaryMd_en || "").trim()];
    if (summary.highlights_en.length > 0) {
      enParts.push(
        "**Highlights:**\n" + summary.highlights_en.map((h) => `- ${h}`).join("\n")
      );
    }
    sections.push(enParts.join("\n\n"));
  }

  const mermaid = summary.mermaid_flow.trim();
  if (mermaid !== "") {
    sections.push(language === "zh-CN" ? `## 流程\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`` : `## Flow\n\n\`\`\`mermaid\n${mermaid}\n\`\`\``);
  }

  return sections.join("\n\n---\n\n");
}

// Keep legacy bilingual export for backward compat
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
    sections.push(`## Flow / 流程\n\n\`\`\`mermaid\n${mermaid}\n\`\`\``);
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
  error_handling: { icon: "🪲", label: "Error handling issue" },
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

function pickFence(body: string): string {
  const runs = body.match(/`+/g) ?? [];
  let longest = 0;
  for (const r of runs) longest = Math.max(longest, r.length);
  return "`".repeat(Math.max(3, longest + 1));
}

function renderAiPromptBlock(prompt: string): string {
  const trimmed = prompt.trim();
  const fence = pickFence(trimmed);
  return `<details>\n<summary>🤖 Prompt for AI Agents</summary>\n\n${fence}\n${trimmed}\n${fence}\n\n</details>`;
}

export function renderFinding(
  finding: ReviewFinding,
  language: OutputLanguage
): string {
  const blocks: string[] = [];

  if (language === "zh-CN") {
    if (nonEmpty(finding.title_zh) && nonEmpty(finding.summary_zh)) {
      const lines = [`**${finding.title_zh.trim()}**`, "", finding.summary_zh.trim()];
      if (nonEmpty(finding.suggestion_zh)) {
        lines.push("", `**建议：** ${finding.suggestion_zh.trim()}`);
      }
      blocks.push(lines.join("\n"));
    }
    // Fallback to English if Chinese fields are empty
    if (blocks.length === 0 && nonEmpty(finding.title_en) && nonEmpty(finding.summary_en)) {
      const lines = [`**${finding.title_en.trim()}**`, "", finding.summary_en.trim()];
      if (nonEmpty(finding.suggestion_en)) {
        lines.push("", `**Suggestion:** ${finding.suggestion_en.trim()}`);
      }
      blocks.push(lines.join("\n"));
    }
  } else {
    if (nonEmpty(finding.title_en) && nonEmpty(finding.summary_en)) {
      const lines = [`**${finding.title_en.trim()}**`, "", finding.summary_en.trim()];
      if (nonEmpty(finding.suggestion_en)) {
        lines.push("", `**Suggestion:** ${finding.suggestion_en.trim()}`);
      }
      blocks.push(lines.join("\n"));
    }
  }

  if (blocks.length === 0) return "";

  const sections = [
    formatFindingBadge(finding),
    blocks.join("\n\n---\n\n"),
  ];
  if (nonEmpty(finding.aiPrompt)) {
    sections.push(renderAiPromptBlock(finding.aiPrompt));
  }
  return sections.join("\n\n");
}

// Keep legacy bilingual export for backward compat
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

  const sections = [
    formatFindingBadge(finding),
    blocks.join("\n\n---\n\n"),
  ];
  if (nonEmpty(finding.aiPrompt)) {
    sections.push(renderAiPromptBlock(finding.aiPrompt));
  }
  return sections.join("\n\n");
}