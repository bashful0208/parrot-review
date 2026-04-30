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

// ---------------------------------------------------------------------------
// renderBilingualFinding — inline review comment body
// ---------------------------------------------------------------------------

const ISSUE_TYPE_BADGE = {
  quality: { icon: "⚠️", label: "Potential issue" },
  security: { icon: "🛡️", label: "Security issue" },
};

const SEVERITY_BADGE = {
  low: { icon: "🟡", label: "Minor" },
  medium: { icon: "🟠", label: "Moderate" },
  high: { icon: "🔴", label: "Major" },
  critical: { icon: "🚨", label: "Critical" },
};

function formatFindingBadge_reference(f) {
  const typeBadge = ISSUE_TYPE_BADGE[f.issueType] ?? {
    icon: "⚠️",
    label: "Potential issue",
  };
  const sevBadge = SEVERITY_BADGE[f.severity] ?? { icon: "🟡", label: "Minor" };
  return `${typeBadge.icon} ${typeBadge.label} | ${sevBadge.icon} ${sevBadge.label}`;
}

function pickFence_reference(body) {
  // outer fence must be longer than the longest backtick run in the body
  const runs = body.match(/`+/g) ?? [];
  let longest = 0;
  for (const r of runs) longest = Math.max(longest, r.length);
  return "`".repeat(Math.max(3, longest + 1));
}

function renderAiPrompt_reference(prompt) {
  const trimmed = prompt.trim();
  const fence = pickFence_reference(trimmed);
  return `<details>\n<summary>🤖 Prompt for AI Agents</summary>\n\n${fence}\n${trimmed}\n${fence}\n\n</details>`;
}

function renderBilingualFinding_reference(f) {
  const enFilled =
    typeof f.title_en === "string" && f.title_en.trim() !== "" &&
    typeof f.summary_en === "string" && f.summary_en.trim() !== "";
  const zhFilled =
    typeof f.title_zh === "string" && f.title_zh.trim() !== "" &&
    typeof f.summary_zh === "string" && f.summary_zh.trim() !== "";

  const blocks = [];
  if (enFilled) {
    const lines = [`**${f.title_en.trim()}**`, "", f.summary_en.trim()];
    if (typeof f.suggestion_en === "string" && f.suggestion_en.trim() !== "") {
      lines.push("", `**Suggestion:** ${f.suggestion_en.trim()}`);
    }
    blocks.push(lines.join("\n"));
  }
  if (zhFilled) {
    const lines = [`**${f.title_zh.trim()}**`, "", f.summary_zh.trim()];
    if (typeof f.suggestion_zh === "string" && f.suggestion_zh.trim() !== "") {
      lines.push("", `**建议：** ${f.suggestion_zh.trim()}`);
    }
    blocks.push(lines.join("\n"));
  }
  if (blocks.length === 0) return "";

  const sections = [
    formatFindingBadge_reference(f),
    blocks.join("\n\n---\n\n"),
  ];
  if (typeof f.aiPrompt === "string" && f.aiPrompt.trim() !== "") {
    sections.push(renderAiPrompt_reference(f.aiPrompt));
  }
  return sections.join("\n\n");
}

test("renderBilingualFinding: badge header at top, EN -> sep -> ZH order", () => {
  const out = renderBilingualFinding_reference({
    issueType: "quality",
    severity: "high",
    title_en: "Off-by-one in loop",
    title_zh: "循环边界错误",
    summary_en: "The loop runs N+1 times because of <=.",
    summary_zh: "因为使用了 <=，循环多跑了一次。",
    suggestion_en: "Use < instead of <=.",
    suggestion_zh: "请改用 < 代替 <=。",
  });

  const badgeIdx = out.indexOf("⚠️ Potential issue | 🔴 Major");
  const enTitleIdx = out.indexOf("Off-by-one in loop");
  const sepIdx = out.indexOf("\n---\n");
  const zhTitleIdx = out.indexOf("循环边界错误");

  assert.ok(badgeIdx === 0, "badge is the very first line");
  assert.ok(enTitleIdx > badgeIdx, "EN title comes after badge");
  assert.ok(sepIdx > enTitleIdx, "separator after EN block");
  assert.ok(zhTitleIdx > sepIdx, "ZH title after separator");

  // severity should NOT also appear inline next to titles
  assert.ok(!out.includes("(high)"), "no redundant (severity) on EN title");
  assert.ok(!out.includes("（high）"), "no redundant （severity） on ZH title");

  assert.ok(out.includes("**Suggestion:**"));
  assert.ok(out.includes("**建议：**"));
});

test("renderBilingualFinding: quality+low maps to ⚠️ Potential issue | 🟡 Minor", () => {
  const out = renderBilingualFinding_reference({
    issueType: "quality",
    severity: "low",
    title_en: "T",
    title_zh: "标题",
    summary_en: "S",
    summary_zh: "概述",
    suggestion_en: "",
    suggestion_zh: "",
  });
  assert.ok(out.startsWith("⚠️ Potential issue | 🟡 Minor"));
});

test("renderBilingualFinding: security+critical maps to 🛡️ Security issue | 🚨 Critical", () => {
  const out = renderBilingualFinding_reference({
    issueType: "security",
    severity: "critical",
    title_en: "T",
    title_zh: "标题",
    summary_en: "S",
    summary_zh: "概述",
    suggestion_en: "",
    suggestion_zh: "",
  });
  assert.ok(out.startsWith("🛡️ Security issue | 🚨 Critical"));
});

test("renderBilingualFinding: medium severity maps to 🟠 Moderate", () => {
  const out = renderBilingualFinding_reference({
    issueType: "quality",
    severity: "medium",
    title_en: "T",
    title_zh: "标题",
    summary_en: "S",
    summary_zh: "概述",
    suggestion_en: "",
    suggestion_zh: "",
  });
  assert.ok(out.includes("🟠 Moderate"));
});

test("renderBilingualFinding: ZH only fields render badge + only ZH block (no separator)", () => {
  const out = renderBilingualFinding_reference({
    issueType: "quality",
    severity: "low",
    title_en: "",
    title_zh: "循环边界错误",
    summary_en: "",
    summary_zh: "因为使用了 <=，循环多跑了一次。",
    suggestion_en: "",
    suggestion_zh: "请改用 <。",
  });
  assert.ok(out.startsWith("⚠️ Potential issue | 🟡 Minor"));
  assert.ok(out.includes("循环边界错误"));
  assert.ok(out.includes("**建议：**"));
  assert.ok(!out.includes("**Suggestion:**"));
  assert.ok(!out.includes("\n---\n"), "no separator when only one side rendered");
});

test("renderBilingualFinding: missing suggestion just omits the Suggestion line", () => {
  const out = renderBilingualFinding_reference({
    issueType: "quality",
    severity: "medium",
    title_en: "Issue",
    title_zh: "问题",
    summary_en: "Summary.",
    summary_zh: "概述。",
    suggestion_en: "",
    suggestion_zh: "",
  });
  assert.ok(out.includes("**Issue**"));
  assert.ok(out.includes("**问题**"));
  assert.ok(!out.includes("**Suggestion:**"));
  assert.ok(!out.includes("**建议：**"));
});

test("renderBilingualFinding: empty EN and ZH returns empty string", () => {
  const out = renderBilingualFinding_reference({
    issueType: "quality",
    severity: "low",
    title_en: "",
    title_zh: "",
    summary_en: "",
    summary_zh: "",
    suggestion_en: "",
    suggestion_zh: "",
  });
  assert.equal(out, "");
});

test("renderBilingualFinding: appends Prompt for AI Agents details block when aiPrompt present", () => {
  const out = renderBilingualFinding_reference({
    issueType: "quality",
    severity: "high",
    title_en: "Index drift",
    title_zh: "索引漂移",
    summary_en: "i may not match.",
    summary_zh: "i 可能不匹配。",
    suggestion_en: "use map by fingerprint",
    suggestion_zh: "用 fingerprint 做 map",
    aiPrompt:
      "In `apps/worker/src/handlers/review.ts` around lines 213-216, change loop to map issues by fingerprint.",
  });

  assert.ok(out.includes("<details>"));
  assert.ok(out.includes("<summary>🤖 Prompt for AI Agents</summary>"));
  assert.ok(out.includes("</details>"));
  assert.ok(out.includes("In `apps/worker/src/handlers/review.ts` around lines 213-216"));
  // prompt body is inside a fenced code block so users get a copy button on GH
  assert.ok(out.includes("\n```\n"), "prompt is wrapped in a triple-backtick fence");

  const detailsIdx = out.indexOf("<details>");
  const zhIdx = out.indexOf("索引漂移");
  assert.ok(detailsIdx > zhIdx, "details block comes after the bilingual content");
});

test("renderBilingualFinding: omits Prompt for AI Agents block when aiPrompt missing or blank", () => {
  const base = {
    issueType: "quality",
    severity: "low",
    title_en: "T",
    title_zh: "标题",
    summary_en: "S",
    summary_zh: "概述",
    suggestion_en: "",
    suggestion_zh: "",
  };

  const noField = renderBilingualFinding_reference(base);
  assert.ok(!noField.includes("<details>"));
  assert.ok(!noField.includes("Prompt for AI Agents"));

  const emptyField = renderBilingualFinding_reference({ ...base, aiPrompt: "   " });
  assert.ok(!emptyField.includes("<details>"));
  assert.ok(!emptyField.includes("Prompt for AI Agents"));
});

test("renderBilingualFinding: aiPrompt with triple-backtick is escaped via 4-backtick fence", () => {
  const out = renderBilingualFinding_reference({
    issueType: "quality",
    severity: "low",
    title_en: "T",
    title_zh: "标题",
    summary_en: "S",
    summary_zh: "概述",
    suggestion_en: "",
    suggestion_zh: "",
    aiPrompt: "Replace ```js\nfoo()\n``` with bar()",
  });
  // Outer fence must be longer than any inner fence to avoid premature close.
  assert.ok(out.includes("\n````\n"), "outer fence is 4 backticks when prompt contains 3");
  assert.ok(out.includes("Replace ```js"));
});
