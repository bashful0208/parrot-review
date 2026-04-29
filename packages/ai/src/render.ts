import type { ReviewSummary } from "./types.js";

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
