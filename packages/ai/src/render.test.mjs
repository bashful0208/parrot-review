import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Reference impl — production lives in render.ts
// ---------------------------------------------------------------------------

function renderBilingualSummary_reference(summary) {
  const sections = [];

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

test("renderBilingualSummary: full payload renders EN -> ZH -> mermaid", () => {
  const out = renderBilingualSummary_reference({
    summaryMd_en: "EN summary text.",
    summaryMd_zh: "中文摘要内容。",
    highlights_en: ["a", "b"],
    highlights_zh: ["甲", "乙"],
    mermaid_flow: "```mermaid\nflowchart LR\nA-->B\n```",
  });

  const enIdx = out.indexOf("EN summary text.");
  const zhIdx = out.indexOf("中文摘要内容。");
  const flowIdx = out.indexOf("flowchart LR");
  assert.ok(enIdx >= 0 && zhIdx > enIdx && flowIdx > zhIdx, "order EN -> ZH -> mermaid");

  assert.ok(out.includes("**Highlights:**"));
  assert.ok(out.includes("- a"));
  assert.ok(out.includes("- b"));
  assert.ok(out.includes("**关键变更:**"));
  assert.ok(out.includes("- 甲"));
  assert.ok(out.includes("- 乙"));
  assert.ok(out.includes("## Flow / 流程"));
});

test("renderBilingualSummary: empty mermaid omits flow section + separator", () => {
  const out = renderBilingualSummary_reference({
    summaryMd_en: "EN.",
    summaryMd_zh: "中。",
    highlights_en: [],
    highlights_zh: [],
    mermaid_flow: "",
  });
  assert.ok(!out.includes("## Flow"));
  assert.ok(!out.includes("流程"));
  assert.ok(!out.includes("```mermaid"));
});

test("renderBilingualSummary: empty highlights_en omits English Highlights block", () => {
  const out = renderBilingualSummary_reference({
    summaryMd_en: "EN.",
    summaryMd_zh: "中。",
    highlights_en: [],
    highlights_zh: ["甲"],
    mermaid_flow: "",
  });
  assert.ok(!out.includes("**Highlights:**"));
  assert.ok(out.includes("**关键变更:**"));
  assert.ok(out.includes("- 甲"));
});

test("renderBilingualSummary: empty highlights_zh omits Chinese highlights block", () => {
  const out = renderBilingualSummary_reference({
    summaryMd_en: "EN.",
    summaryMd_zh: "中。",
    highlights_en: ["a"],
    highlights_zh: [],
    mermaid_flow: "",
  });
  assert.ok(out.includes("**Highlights:**"));
  assert.ok(out.includes("- a"));
  assert.ok(!out.includes("**关键变更:**"));
});

test("renderBilingualSummary: still has separators between EN/ZH when both summaries present", () => {
  const out = renderBilingualSummary_reference({
    summaryMd_en: "EN.",
    summaryMd_zh: "中。",
    highlights_en: [],
    highlights_zh: [],
    mermaid_flow: "",
  });
  assert.match(out, /EN\.\s*\n\s*---\s*\n\s*## 摘要/);
});

test("renderBilingualSummary: trims whitespace from summary fields", () => {
  const out = renderBilingualSummary_reference({
    summaryMd_en: "  spaced EN  \n",
    summaryMd_zh: "\n  含空白中文  ",
    highlights_en: [],
    highlights_zh: [],
    mermaid_flow: "  ",
  });
  assert.ok(out.includes("spaced EN"));
  assert.ok(out.includes("含空白中文"));
  assert.ok(!out.includes("## Flow"), "whitespace-only mermaid is treated as empty");
});
