import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AppError, ErrorCode } from "@reviewer/core";

import type {
  CritiqueResult,
  OutputLanguage,
  ReviewContext,
  ReviewFinding,
  ReviewResult,
  ReviewSummary,
  ReviewSummaryResult,
} from "./types.js";
import {
  noopUsageRecorder,
  withUsageInstrumentation,
  type AiProvider,
  type UsageContext,
  type UsageLogger,
  type UsageRecorder,
} from "./usage.js";

// ---------------------------------------------------------------------------
// Internal log helper
// ---------------------------------------------------------------------------

function log(
  level: "info" | "warn" | "error",
  msg: string,
  extra?: Record<string, unknown>
) {
  const line = JSON.stringify({ level, component: "ai-adapter", msg, ...extra });
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiAdapterConfig = {
  provider: "anthropic" | "openai" | "alibaba" | "custom";
  model: string;
  apiKey: string;
  baseUrl?: string;
};

function buildUsageCtx(
  context: ReviewContext,
  provider: AiProvider,
  model: string,
  taskType:
    | "review_findings"
    | "review_summary"
    | "verify_finding"
    | "regenerate_finding"
): UsageContext {
  return {
    organizationId: context.organizationId,
    repositoryId: context.repositoryId ?? null,
    pullRequestId: context.pullRequestId ?? null,
    reviewRunId: context.reviewRunId ?? null,
    providerConfigId: context.providerConfigId ?? null,
    provider,
    model,
    taskType,
  };
}

const usageLogger: UsageLogger = {
  warn: (msg, extra) => log("warn", msg, extra),
};

export interface AiAdapter {
  generateReviewFindings(context: ReviewContext): Promise<ReviewResult>;
  generateReviewSummary(context: ReviewContext): Promise<ReviewSummaryResult>;
  verifyFinding(
    finding: ReviewFinding,
    context: ReviewContext
  ): Promise<CritiqueResult>;
  regenerateFinding(
    finding: ReviewFinding,
    critique: CritiqueResult,
    context: ReviewContext
  ): Promise<ReviewFinding>;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const MAX_DIFF_CHARS = 80_000;

function langFields(lang: OutputLanguage) {
  return lang === "zh-CN"
    ? { title: "title_zh", summary: "summary_zh", suggestion: "suggestion_zh" }
    : { title: "title_en", summary: "summary_en", suggestion: "suggestion_en" };
}

function buildSummarySchema(lang: OutputLanguage) {
  const lf = langFields(lang);
  return {
    type: "object" as const,
    properties: {
      summaryMd_en: { type: "string" as const },
      summaryMd_zh: { type: "string" as const },
      highlights_en: { type: "array" as const, items: { type: "string" as const } },
      highlights_zh: { type: "array" as const, items: { type: "string" as const } },
      mermaid_flow: { type: "string" as const },
    },
    required: [lf.summary === "summary_en" ? "summaryMd_en" : "summaryMd_zh",
               lf.summary === "summary_en" ? "highlights_en" : "highlights_zh",
               "mermaid_flow"] as string[],
  };
}

function buildFindingsItemRequired(lang: OutputLanguage): string[] {
  const lf = langFields(lang);
  return [
    "filePath", "startLine", "endLine", "side", "issueType", "severity",
    lf.title, lf.summary, lf.suggestion,
    "aiPrompt", "confidenceScore",
  ];
}

function buildFindingsSchema(lang: OutputLanguage) {
  return {
    type: "object" as const,
    properties: {
      findings: {
        type: "array" as const,
        maxItems: 5,
        items: {
          type: "object" as const,
          properties: {
            filePath: { type: "string" as const },
            startLine: { type: "integer" as const },
            endLine: { type: "integer" as const },
            side: { type: "string" as const, enum: ["LEFT", "RIGHT"] },
            issueType: { type: "string" as const, enum: ["quality", "security", "error_handling"] },
            severity: { type: "string" as const, enum: ["low", "medium", "high", "critical"] },
            title_en: { type: "string" as const },
            title_zh: { type: "string" as const },
            summary_en: { type: "string" as const },
            summary_zh: { type: "string" as const },
            suggestion_en: { type: "string" as const },
            suggestion_zh: { type: "string" as const },
            aiPrompt: { type: "string" as const },
            confidenceScore: { type: "number" as const, minimum: 0, maximum: 1 },
          },
          required: buildFindingsItemRequired(lang),
        },
      },
      hasMore: { type: "boolean" as const },
    },
    required: ["findings", "hasMore"] as string[],
  };
}

function buildVerifySchema(findingItemRequired: string[]) {
  return {
    type: "object" as const,
    properties: {
      valid: { type: "boolean" as const },
      reason: { type: "string" as const },
      confidenceScore: { type: "number" as const, minimum: 0, maximum: 1 },
      patchedFinding: {
        type: "object" as const,
        properties: buildFindingsSchema("en-US").properties.findings.items.properties,
        required: findingItemRequired,
      },
    },
    required: ["valid", "reason", "confidenceScore"] as string[],
  };
}

function buildRegenerateSchema(findingItemRequired: string[]) {
  return {
    type: "object" as const,
    properties: {
      finding: {
        type: "object" as const,
        properties: buildFindingsSchema("en-US").properties.findings.items.properties,
        required: findingItemRequired,
      },
    },
    required: ["finding"] as string[],
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildDiffText(context: ReviewContext): string {
  const parts: string[] = [];
  let totalChars = 0;
  for (const diff of context.diffs) {
    if (!diff.patch) continue;
    const entry = `### File: ${diff.filePath}\n\`\`\`diff\n${diff.patch}\n\`\`\``;
    if (totalChars + entry.length > MAX_DIFF_CHARS) {
      parts.push("// [diff truncated due to size limit]");
      break;
    }
    parts.push(entry);
    totalChars += entry.length;
  }
  return parts.join("\n\n");
}

function requiredFindingFields(lang: OutputLanguage): string[] {
  const lf = langFields(lang);
  return ["filePath", "startLine", "endLine", lf.title, lf.summary, lf.suggestion, "aiPrompt"];
}

function fillEmptyLangFields(item: Record<string, unknown>, lang: OutputLanguage): void {
  if (lang === "zh-CN") {
    if (!item.title_en) (item as Record<string, unknown>).title_en = "";
    if (!item.summary_en) (item as Record<string, unknown>).summary_en = "";
    if (!item.suggestion_en) (item as Record<string, unknown>).suggestion_en = "";
  } else {
    if (!item.title_zh) (item as Record<string, unknown>).title_zh = "";
    if (!item.summary_zh) (item as Record<string, unknown>).summary_zh = "";
    if (!item.suggestion_zh) (item as Record<string, unknown>).suggestion_zh = "";
  }
}

function validateAndNormalizeFindings(input: unknown, lang: OutputLanguage): ReviewFinding[] {
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.findings)) {
    throw new Error("Tool input: 'findings' must be an array");
  }
  const required = requiredFindingFields(lang);
  return (raw.findings as unknown[])
    .filter((item): item is Record<string, unknown> => {
      if (typeof item !== "object" || item === null) return false;
      const obj = item as Record<string, unknown>;
      return required.every((k) => obj[k] !== undefined && obj[k] !== null);
    })
    .map((item) => {
      fillEmptyLangFields(item, lang);
      return {
        ...(item as unknown as ReviewFinding),
        confidenceScore: Math.min(
          1,
          Math.max(0, (item.confidenceScore as number) ?? 0)
        ),
      };
    });
}

function buildUserMessage(context: ReviewContext, diffText: string): string {
  const focusBlock =
    context.focus === "quality"
      ? "Scope: report ONLY code quality / correctness / maintainability / performance issues. Do NOT report security issues — a separate reviewer covers them. Skip if you'd otherwise mark issueType=security. " +
        "Check compliance with the reviewer guidelines provided below. Only report findings with confidenceScore >= 0.80 — skip borderline or trivial observations.\n\n"
      : context.focus === "security"
        ? "Scope: report ONLY security issues (auth, injection, secrets, unsafe deserialization, SSRF, etc.). Do NOT report style or quality nitpicks — a separate reviewer covers them. Skip if you'd otherwise mark issueType=quality.\n\n"
        : context.focus === "error_handling"
          ? "Scope: report ONLY error handling issues. Analyze every try/catch, error callback, .catch() promise handler, and error-return path in the diff. " +
            "Detect: (1) empty catch blocks that suppress errors, (2) overly broad catch (e.g. catch all Exception / Throwable / unknown) that swallows unexpected errors, " +
            "(3) missing or downgraded error logging (errors caught but only logged as warn/info/debug instead of error), " +
            "(4) fallback or default-value behavior that silently masks the underlying error, " +
            "(5) error messages that are not actionable (generic strings like 'something went wrong'), " +
            "(6) missing error code or classification that prevents programmatic handling, " +
            "(7) orphaned resources on error paths (DB records, file handles, network connections created before a failure point but not cleaned up). " +
            "Do NOT report quality/style issues or security vulnerabilities — separate reviewers cover those. Mark issueType='error_handling' for every finding.\n\n"
          : "";

  const guidelinesBlock = context.guidelines
    ? `<reviewer_guidelines>\n${context.guidelines}\n</reviewer_guidelines>\n\n`
    : "";
  const projectBlock = context.projectContext
    ? `<project_context>\n${context.projectContext}\n</project_context>\n\n`
    : "";

  const lang = context.outputLanguage;
  const langInstruction = lang === "zh-CN"
    ? `请为每个发现输出以下中文字段（不要输出英文标题/摘要/建议）：

- \`title_zh\`: 简短标题（≤ 80 字符）。
- \`summary_zh\`: 1–3 句话说明问题和影响，引用符号/文件路径时保持原文。
- \`suggestion_zh\`: 具体的修复建议，代码标识符保持原样。`
    : `For every finding produce these English fields:

- \`title_en\`: a short title (≤ 80 chars).
- \`summary_en\`: 1–3 sentences explaining the issue and its impact. Reference symbols / file paths verbatim.
- \`suggestion_en\`: a concrete fix suggestion. Keep code identifiers in their original form.`;

  	const isZh = lang === "zh-CN";

	const aiPromptInstruction = isZh
	    ? `每个发现必须包含 \`aiPrompt\`：一份详细、可直接复制粘贴的中文指令，面向 AI 编程助手（Cursor / Claude Code 等），使其无需额外上下文即可端到端完成修复。用空行分隔逻辑段落——不要使用 Markdown 标题或无序列表。必须包括：

- 精确的文件路径（直接使用 diff 中的路径，不加 \`@\` 前缀），并通过行号范围或关键符号缩小范围。
- 准确描述当前代码的问题所在（失败模式或不变性违背），以便 AI 在修改前验证问题确实存在。
- 具体的修复方案——新变量/数据结构的名称、精确的控制流变更、需要引入的导入或辅助函数，以及修复后代码的高层次形态。
- AI 修复后可执行的显式验证步骤（需要检查的属性、需要添加或运行的测试）。

目标 80–250 中文字。优先具体而非泛泛而谈。不要粘贴大段代码块；用文字描述变更，通过标识符名称引用。`
	    : `Additionally, every finding MUST include \`aiPrompt\`: a detailed, copy-pasteable English instruction targeted at an AI coding agent (Cursor / Claude Code / similar) that, on its own, gives the agent enough context to apply the fix end-to-end. Structure it with blank lines between logical sections — do NOT use markdown headings or bullet lists. It must include:

- The exact file path (use the path verbatim from the diff, no \`@\` prefix), narrowed by line range or anchor symbol.
- A precise description of what is wrong with the current code (the failure mode or invariant violation), so the agent can verify before changing anything.
- A concrete description of the fix — names of new variables / data structures, the exact control-flow change, any imports or helpers to use, and what the post-fix code should look like at a high level.
- An explicit verification step the agent can do after the fix (a property to check, a test to add or run).

Aim for 80–250 English words. Prefer specifics over generality. Do not paste large code blocks; describe the change in prose, referring to identifiers by name.`;

	const batchInstruction = isZh
	    ? `本次最多报告 5 个发现。如果还有更多问题，请将 "hasMore" 设为 true，系统会在下一批继续提示你。如果已穷尽所有真实问题，请将 "hasMore" 设为 false。`
	    : `Report at most 5 findings in this batch. If there are more issues beyond those 5, set "hasMore": true so the system will prompt you for the next batch. If you have exhausted all real issues, set "hasMore": false.`;

	const introText = isZh
	    ? `你正在审查仓库 ${context.fullName} 的 PR #${context.prNumber}（HEAD SHA: ${context.headSha}）。`
	    : `You are reviewing pull request #${context.prNumber} in repository ${context.fullName} (head SHA: ${context.headSha}).`;

	const analyzePrompt = isZh
	    ? `请分析以下 diff 并调用 \`report_findings\` 工具报告所有真实问题。只报告有实际影响的问题——避免无意义的代码风格挑剔，除非它们确实表明了真实问题。`
	    : `Please analyze the following diff and call the \`report_findings\` tool with all real issues you find. Only report findings with genuine impact — avoid noise and style nitpicks unless they indicate a real problem.`;

	return `${introText}

${focusBlock}${guidelinesBlock}${projectBlock}${analyzePrompt}

${langInstruction}

${aiPromptInstruction}

${batchInstruction}

<diff>
${diffText}
</diff>`;
}

function buildContinuationMessage(
  context: ReviewContext,
  diffText: string,
  previousFindings: ReviewFinding[]
): string {
  const isZh = context.outputLanguage === "zh-CN";
  const summary = previousFindings
    .map((f, i) => {
    const titleField = isZh ? "title_zh" : "title_en";
    const title = (f as any)[titleField] || f.title_en;
    return `${i + 1}. [${f.severity}/${f.issueType}] ${f.filePath}:${f.startLine} — ${title}`;
  }).join("\n");

  const headerText = isZh
    ? `你已经报告了以下 ${previousFindings.length} 个问题：`
    : `You have already reported the following ${previousFindings.length} issue(s):`;

  const instructionText = isZh
    ? `继续审查以下相同的 diff。找出上述未列出的新问题。避免重复。

本批最多再报告 5 个发现。如果还有更多问题，请将 "hasMore" 设为 true。如果已穷尽所有真实问题，请将 "hasMore" 设为 false 且 "findings" 设为 []。`
    : `Continue reviewing the SAME diff below. Find additional issues NOT listed above. Avoid duplicates.

Report up to 5 more findings in this batch. If you find more issues beyond these, set "hasMore": true. If you have exhausted all real issues, set "hasMore": false and "findings": [].`;

  return `${headerText}

${summary}

${instructionText}

<diff>
${diffText}
</diff>`;
}

function buildSummaryUserMessage(context: ReviewContext, diffText: string): string {
  const guidelines = context.guidelines ?? "";
  const projectContext = context.projectContext ?? "";

  const findingsBlock =
    context.finalFindings && context.finalFindings.length > 0
      ? `<verified_findings>
${context.finalFindings
  .map(
    (f, i) =>
      `${i + 1}. [${f.severity}/${f.issueType}] ${f.filePath}:${f.startLine}–${f.endLine} — ${f.title_en || f.title_zh}`
  )
  .join("\n")}
</verified_findings>

These are the final, auditor-verified findings. Reference them when describing risks but do not duplicate the per-finding details.

`
      : "";

  const lang = context.outputLanguage;
  const langInstruction = lang === "zh-CN"
    ? `调用 \`report_summary\` 工具，提供：

- \`summaryMd_zh\`: 简洁的中文 Markdown 概述（3-8 句），说明本 PR 改了什么、为什么改。引用文件/模块名。不要编造 diff 中没有的功能。
- \`highlights_zh\`: 2-6 条中文要点，列出最重要的变更、风险或需要重点关注的地方。
- \`mermaid_flow\`: 仅当 diff 引入或修改了可辨识的执行流、调用链或状态转换时，输出 mermaid 块（例如 \`\`\`mermaid sequenceDiagram ...\`\`\`），否则输出空字符串。`
    : `Call the \`report_summary\` tool with:

- \`summaryMd_en\`: a concise English Markdown overview (3–8 sentences) of what this PR changes and why. Reference file/module names where useful. Do not invent functionality not in the diff.
- \`highlights_en\`: 2–6 short bullet strings naming the most important changes, risks, or things to double-check.
- \`mermaid_flow\`: if and only if the diff introduces or modifies a discernible execution flow, call chain, or state transition, output a mermaid block (e.g. \`\`\`mermaid sequenceDiagram ...\`\`\`). Otherwise output an empty string.`;

  return `You are summarizing pull request #${context.prNumber} in repository ${context.fullName} (head SHA: ${context.headSha}).

<reviewer_guidelines>
${guidelines}
</reviewer_guidelines>

<project_context>
${projectContext}
</project_context>

${findingsBlock}<diff>
${diffText}
</diff>

${langInstruction}`;
}

function buildSystemPrompt(lang: OutputLanguage): string {
  const langNote = lang === "zh-CN"
    ? "你必须使用简体中文输出标题、摘要和建议。代码标识符、符号和文件路径保持原文。"
    : "You produce findings in English. Code identifiers, symbols, and file paths stay in their original form.";
  return "You are a senior code reviewer. Your job is to identify real, impactful issues in code changes — bugs, security vulnerabilities, logic errors, and serious quality problems. Avoid reporting trivial style issues. Be precise about file paths and line numbers. " + langNote;
}

function buildSummarySystemPrompt(lang: OutputLanguage): string {
  const langNote = lang === "zh-CN"
    ? "你必须使用简体中文输出摘要和要点。"
    : "You produce English outputs.";
  return "You are a senior code reviewer summarizing a pull request for a teammate. " +
    "Be accurate, specific, and concise. Describe what changed and why; flag noteworthy risks. " +
    "Do not fabricate behavior that is not in the diff. " +
    langNote + " " +
    "When the diff introduces or alters a clear execution flow, call chain, or state transition, output a mermaid diagram in the mermaid_flow field; otherwise leave it empty.";
}

function buildVerifySystemPrompt(lang: OutputLanguage): string {
  return lang === "zh-CN"
    ? "你是一名代码审查审计员。你的唯一职责是验证审查发现是否准确、有用。保持怀疑态度：拒绝幻觉 bug、行号不匹配、以及建议无法真正修复问题的发现。如果发现大体正确但存在缺陷，返回 valid=false 并附带修正后的 patchedFinding。"
    : "You are a code review auditor. Your only job is to verify whether a draft finding is correct and useful. Be skeptical: reject hallucinated bugs, mismatched line ranges, and findings whose suggestion does not actually fix the problem. When the finding is mostly right but flawed, return valid=false with patchedFinding fixed.";
}

function buildRegenerateSystemPrompt(lang: OutputLanguage): string {
  return lang === "zh-CN"
    ? "你是一名代码审查员，正在修复被审计员驳回的发现。仔细阅读审计员给出的原因，然后重写该发现，确保问题真实存在、行号范围与 diff 匹配、语言字段完整。通过 report_finding 工具返回修正后的发现。"
    : "You are a code reviewer fixing a draft finding that an auditor rejected. Read the auditor's reason carefully, then rewrite the finding so the issue is real, the line range matches the diff, and language fields are complete. Return the corrected finding via the report_finding tool.";
}

function buildVerifyUserMessage(
  finding: ReviewFinding,
  context: ReviewContext
): string {
  const targetDiff =
    context.diffs.find((d) => d.filePath === finding.filePath)?.patch ??
    "(diff not found)";
  const lang = context.outputLanguage;
  const isZh = lang === "zh-CN";
  const langFieldNames = isZh
    ? "title_zh / summary_zh / suggestion_zh"
    : "title_en / summary_en / suggestion_en";
  const headerText = isZh
    ? `你正在审计仓库 ${context.fullName} 中 PR #${context.prNumber} 的一条代码审查发现。`
    : `You are auditing a code review finding for pull request #${context.prNumber} in ${context.fullName}.`;

  const instructionText = isZh
    ? `判断以下发现是否是一个真实、格式良好、值得反馈给开发者的有效问题。

发现应被驳回（valid=false）如果：
- 描述的问题在 diff 中实际不存在，
- 文件路径 / 行号范围与实际变更不匹配，
- severity / issueType 严重不匹配，
- 建议无法修复问题或会使问题更糟，
- ${langFieldNames} 字段缺失或为空。

如果发现大体正确但存在可修复的缺陷，设置 valid=false 并填充 patchedFinding 为修正后的完整 ReviewFinding 对象。

如果发现可以接受，设置 valid=true 且 reason="ok"。`
    : `Decide whether the finding below is a real, well-formed issue worth posting to the developer.

A finding should be REJECTED (valid=false) if:
- the issue described is not actually present in the diff,
- the file path / line range does not match the actual change,
- the severity / issueType is grossly mismatched,
- the suggestion would not fix the problem or would make it worse,
- the ${langFieldNames} fields are missing or empty.

If the finding is mostly correct but has fixable defects, set valid=false AND populate patchedFinding with a corrected full ReviewFinding object.

If the finding is acceptable as-is, set valid=true and reason="ok".`;

  const callToolText = isZh
    ? `调用 \`verify_finding\` 工具提交你的决策。`
    : `Call the \`verify_finding\` tool with your decision.`;

  return `${headerText}

${instructionText}

<finding>
${JSON.stringify(finding, null, 2)}
</finding>

<diff_for_${finding.filePath}>
\`\`\`diff
${targetDiff}
\`\`\`
</diff_for_${finding.filePath}>

${callToolText}`;
}

function buildRegenerateUserMessage(
  finding: ReviewFinding,
  critique: CritiqueResult,
  context: ReviewContext
): string {
  const targetDiff =
    context.diffs.find((d) => d.filePath === finding.filePath)?.patch ??
    "(diff not found)";
  const auditorPatch = critique.patchedFinding
    ? `<auditor_proposed_patch>\n${JSON.stringify(critique.patchedFinding, null, 2)}\n</auditor_proposed_patch>\n\n`
    : "";
  const isZh = context.outputLanguage === "zh-CN";

  const headerText = isZh
    ? `审计员驳回了仓库 ${context.fullName} 中 PR #${context.prNumber} 的以下草稿发现：`
    : `Auditor rejected the following draft finding for pull request #${context.prNumber} in ${context.fullName}:`;

  const instructionText = isZh
    ? `重写该发现以解决审计员指出的问题。保留已有语言字段；不要倒退已有的良好字段。通过 \`report_finding\` 工具返回修正后的发现。`
    : `Rewrite the finding to address the auditor's reason. Keep the language fields; do not regress existing-good fields. Call the \`report_finding\` tool with the corrected finding.`;

  return `${headerText}

<auditor_reason>
${critique.reason}
</auditor_reason>

<draft_finding>
${JSON.stringify(finding, null, 2)}
</draft_finding>

${auditorPatch}<diff_for_${finding.filePath}>
\`\`\`diff
${targetDiff}
\`\`\`
</diff_for_${finding.filePath}>

${instructionText}`;
}

function validateAndNormalizeCritique(input: unknown): CritiqueResult {
  if (typeof input !== "object" || input === null) {
    throw new Error("Tool input: verify_finding expected an object");
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.valid !== "boolean") {
    throw new Error("Tool input: 'valid' must be boolean");
  }
  if (typeof obj.reason !== "string") {
    throw new Error("Tool input: 'reason' must be string");
  }
  const score = typeof obj.confidenceScore === "number" ? obj.confidenceScore : 0;
  const patched =
    obj.patchedFinding && typeof obj.patchedFinding === "object"
      ? (obj.patchedFinding as ReviewFinding)
      : undefined;
  return {
    valid: obj.valid,
    reason: obj.reason,
    confidenceScore: Math.min(1, Math.max(0, score)),
    patchedFinding: patched,
  };
}

function validateAndNormalizeRegenerated(input: unknown, lang: OutputLanguage): ReviewFinding {
  if (typeof input !== "object" || input === null) {
    throw new Error("Tool input: report_finding expected an object");
  }
  const obj = input as Record<string, unknown>;
  const finding = obj.finding as Record<string, unknown> | undefined;
  if (!finding || typeof finding !== "object") {
    throw new Error("Tool input: 'finding' must be an object");
  }
  const required = requiredFindingFields(lang);
  for (const k of required) {
    if (finding[k] === undefined || finding[k] === null) {
      throw new Error(`Tool input: regenerated finding missing field '${k}'`);
    }
  }
  fillEmptyLangFields(finding, lang);
  return {
    ...(finding as unknown as ReviewFinding),
    confidenceScore: Math.min(
      1,
      Math.max(0, (finding.confidenceScore as number) ?? 0)
    ),
  };
}

function repairTruncatedJson(partial: string): unknown {
  let repaired = partial;
  let inString = false;
  let escaped = false;
  let openBraces = 0;
  let closeBraces = 0;
  let openBrackets = 0;
  let closeBrackets = 0;

  for (const ch of partial) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") closeBraces++;
    if (ch === "[") openBrackets++;
    if (ch === "]") closeBrackets++;
  }

  if (inString) repaired += '"';
  repaired += "]".repeat(Math.max(0, openBrackets - closeBrackets));
  repaired += "}".repeat(Math.max(0, openBraces - closeBraces));

  return JSON.parse(repaired);
}

function deduplicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.filePath}:${f.startLine}:${f.title_en}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractJsonFromText(text: string | null | undefined): unknown {
  if (typeof text !== "string" || text.trim() === "") return undefined;

  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }

  return undefined;
}

function validateAndNormalizeSummary(input: unknown, lang: OutputLanguage): ReviewSummary {
  if (typeof input !== "object" || input === null) {
    throw new Error("Tool input: report_summary expected an object");
  }
  const obj = input as Record<string, unknown>;
  const en = obj.summaryMd_en as string | undefined;
  const zh = obj.summaryMd_zh as string | undefined;
  const hiEn = obj.highlights_en;
  const hiZh = obj.highlights_zh;
  const mermaid = obj.mermaid_flow;

  if (lang === "zh-CN") {
    if (typeof zh !== "string" || zh.trim() === "") {
      throw new Error("Tool input: 'summaryMd_zh' must be a non-empty string");
    }
    if (!Array.isArray(hiZh)) {
      throw new Error("Tool input: 'highlights_zh' must be an array");
    }
  } else {
    if (typeof en !== "string" || en.trim() === "") {
      throw new Error("Tool input: 'summaryMd_en' must be a non-empty string");
    }
    if (!Array.isArray(hiEn)) {
      throw new Error("Tool input: 'highlights_en' must be an array");
    }
  }
  if (typeof mermaid !== "string") {
    throw new Error(
      "Tool input: 'mermaid_flow' must be a string (use empty string when no flow)"
    );
  }

  return {
    summaryMd_en: typeof en === "string" ? en : "",
    summaryMd_zh: typeof zh === "string" ? zh : "",
    highlights_en: Array.isArray(hiEn)
      ? hiEn.filter((h): h is string => typeof h === "string" && h.trim() !== "")
      : [],
    highlights_zh: Array.isArray(hiZh)
      ? hiZh.filter((h): h is string => typeof h === "string" && h.trim() !== "")
      : [],
    mermaid_flow: mermaid as string,
  };
}

// ---------------------------------------------------------------------------
// AnthropicAdapter
// ---------------------------------------------------------------------------

function makeAnthropicFindingsTool(lang: OutputLanguage): Anthropic.Tool {
  return {
    name: "report_findings",
    description: "Report code review findings for the given pull request diff.",
    input_schema: buildFindingsSchema(lang) as Anthropic.Tool["input_schema"],
  };
}

function makeAnthropicSummaryTool(lang: OutputLanguage): Anthropic.Tool {
  return {
    name: "report_summary",
    description: "Report a concise overall summary and key highlights for the given pull request diff.",
    input_schema: buildSummarySchema(lang) as Anthropic.Tool["input_schema"],
  };
}

function makeAnthropicVerifyTool(lang: OutputLanguage): Anthropic.Tool {
  const itemRequired = buildFindingsItemRequired(lang);
  return {
    name: "verify_finding",
    description: "Audit a draft code review finding and return verdict.",
    input_schema: buildVerifySchema(itemRequired) as Anthropic.Tool["input_schema"],
  };
}

function makeAnthropicRegenerateTool(lang: OutputLanguage): Anthropic.Tool {
  const itemRequired = buildFindingsItemRequired(lang);
  return {
    name: "report_finding",
    description: "Return a corrected single finding after auditor rejection.",
    input_schema: buildRegenerateSchema(itemRequired) as Anthropic.Tool["input_schema"],
  };
}

export class AnthropicAdapter implements AiAdapter {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly recorder: UsageRecorder;
  private readonly provider: AiProvider = "anthropic";

  constructor(config: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    recorder?: UsageRecorder;
  }) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model;
    this.recorder = config.recorder ?? noopUsageRecorder;
  }

  async generateReviewFindings(context: ReviewContext): Promise<ReviewResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      return { findings: [] };
    }
    const lang = context.outputLanguage;
    const findingsTool = makeAnthropicFindingsTool(lang);
    const systemPrompt = buildSystemPrompt(lang);

    return withUsageInstrumentation(
      buildUsageCtx(context, this.provider, this.model, "review_findings"),
      async () => {
        const MAX_ROUNDS = 6;
        const MAX_FORMAT_RETRIES = 3;

        const allFindings: ReviewFinding[] = [];
        let previousFindings: ReviewFinding[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let anyTruncated = false;

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const userMsg =
            round === 0
              ? buildUserMessage(context, diffText)
              : buildContinuationMessage(context, diffText, previousFindings);

          let formatRetries = 0;
          let parsed: unknown = undefined;
          let roundTruncated = false;
          let lastFormatError: string | undefined;

          while (formatRetries <= MAX_FORMAT_RETRIES && parsed === undefined) {
            const retryMsg =
              formatRetries === 0
                ? userMsg
                : lastFormatError
                  ? `Your previous response had invalid tool input: "${lastFormatError}". Please ensure 'findings' is a JSON array of objects with all required fields (filePath, startLine, endLine, title, summary, suggestion, aiPrompt). Call the report_findings tool again.\n\n${userMsg}`
                  : `Please call the report_findings tool with valid JSON. Do not leave string fields empty or unclosed.\n\n${userMsg}`;
            try {
              log("info", "Anthropic batch round start", {
                prNumber: context.prNumber,
                round,
                attempt: formatRetries,
              });
              const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 16384,
                system: systemPrompt,
                messages: [{ role: "user", content: retryMsg }],
                tools: [findingsTool],
                tool_choice: { type: "tool", name: "report_findings" },
              });

              totalInputTokens += response.usage?.input_tokens ?? 0;
              totalOutputTokens += response.usage?.output_tokens ?? 0;
              roundTruncated = response.stop_reason === "max_tokens";
              if (roundTruncated) anyTruncated = true;
              log("info", "Anthropic batch round done", {
                prNumber: context.prNumber,
                round,
                attempt: formatRetries,
                stop_reason: response.stop_reason,
                input_tokens: response.usage?.input_tokens,
                output_tokens: response.usage?.output_tokens,
                truncated: roundTruncated,
              });

              const toolUseBlock = response.content.find(
                (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
              );

              if (toolUseBlock) {
                parsed = toolUseBlock.input;
                try {
                  validateAndNormalizeFindings(parsed, lang);
                } catch (validationErr) {
                  lastFormatError = validationErr instanceof Error ? validationErr.message : String(validationErr);
                  log("warn", "Anthropic tool input validation failed, will retry", {
                    prNumber: context.prNumber,
                    round,
                    attempt: formatRetries,
                    error: lastFormatError,
                  });
                  parsed = undefined;
                }
              }
            } catch (apiErr) {
              log("warn", "Anthropic API error in batch round", {
                prNumber: context.prNumber,
                round,
                attempt: formatRetries,
                error: apiErr instanceof Error ? apiErr.message : String(apiErr),
              });
              break;
            }

            if (parsed !== undefined) break;
            formatRetries++;
          }

          if (parsed === undefined) {
            log("warn", "Anthropic batch round skipped (no parsed result)", {
              prNumber: context.prNumber,
              round,
            });
            continue;
          }

          const data = parsed as Record<string, unknown>;
          const hasMore = data.hasMore === true;
          const newFindings = validateAndNormalizeFindings(parsed, lang);
          log("info", "Anthropic batch round parsed", {
            prNumber: context.prNumber,
            round,
            findingsCount: newFindings.length,
            hasMore,
            truncated: roundTruncated,
          });

          allFindings.push(...newFindings);
          previousFindings = newFindings;

          if (!hasMore) {
            if (roundTruncated && newFindings.length > 0) continue;
            break;
          }
          if (newFindings.length === 0) break;
        }

        return {
          result: { findings: deduplicateFindings(allFindings) },
          outcome: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            truncated: anyTruncated,
            metadata: {},
          },
        };
      },
      this.recorder,
      usageLogger
    );
  }

  async generateReviewSummary(
    context: ReviewContext
  ): Promise<ReviewSummaryResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      const isZh = context.outputLanguage === "zh-CN";
      return {
        summary: {
          summaryMd_en: isZh ? "" : "_No textual diff to summarize._",
          summaryMd_zh: isZh ? "_本次 PR 没有可用于总结的代码 diff。_" : "",
          highlights_en: [],
          highlights_zh: [],
          mermaid_flow: "",
        },
      };
    }
    const lang = context.outputLanguage;
    const summaryTool = makeAnthropicSummaryTool(lang);
    const systemPrompt = buildSummarySystemPrompt(lang);

    return withUsageInstrumentation(
      buildUsageCtx(context, this.provider, this.model, "review_summary"),
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 16384,
          system: systemPrompt,
          messages: [
            { role: "user", content: buildSummaryUserMessage(context, diffText) },
          ],
          tools: [summaryTool],
          tool_choice: { type: "tool", name: "report_summary" },
        });

        log("info", "Anthropic API summary call succeeded", {
          prNumber: context.prNumber,
          stop_reason: response.stop_reason,
        });

        const truncated = response.stop_reason === "max_tokens";
        const toolUseBlock = response.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );

        if (!toolUseBlock) {
          throw new Error(
            "Anthropic API did not return expected tool_use block for report_summary"
          );
        }

        const summary = validateAndNormalizeSummary(toolUseBlock.input, lang);
        return {
          result: { summary },
          outcome: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null,
            truncated,
            metadata: { stop_reason: response.stop_reason },
          },
        };
      },
      this.recorder,
      usageLogger
    );
  }

  async verifyFinding(
    finding: ReviewFinding,
    context: ReviewContext
  ): Promise<CritiqueResult> {
    const lang = context.outputLanguage;
    const verifyTool = makeAnthropicVerifyTool(lang);
    return withUsageInstrumentation(
      {
        ...buildUsageCtx(context, this.provider, this.model, "verify_finding"),
        agentRole: "critic",
        attemptNumber: 0,
      },
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 16384,
          system: buildVerifySystemPrompt(lang),
          messages: [
            { role: "user", content: buildVerifyUserMessage(finding, context) },
          ],
          tools: [verifyTool],
          tool_choice: { type: "tool", name: "verify_finding" },
        });

        const truncated = response.stop_reason === "max_tokens";
        const toolUseBlock = response.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );
        if (!toolUseBlock) {
          throw new Error(
            "Anthropic API did not return expected tool_use block for verify_finding"
          );
        }
        const critique = validateAndNormalizeCritique(toolUseBlock.input);
        return {
          result: critique,
          outcome: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null,
            truncated,
            metadata: { stop_reason: response.stop_reason },
          },
        };
      },
      this.recorder,
      usageLogger
    );
  }

  async regenerateFinding(
    finding: ReviewFinding,
    critique: CritiqueResult,
    context: ReviewContext
  ): Promise<ReviewFinding> {
    const lang = context.outputLanguage;
    const regenerateTool = makeAnthropicRegenerateTool(lang);
    return withUsageInstrumentation(
      {
        ...buildUsageCtx(context, this.provider, this.model, "regenerate_finding"),
        agentRole: "regenerator",
        attemptNumber: 0,
      },
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 16384,
          system: buildRegenerateSystemPrompt(lang),
          messages: [
            {
              role: "user",
              content: buildRegenerateUserMessage(finding, critique, context),
            },
          ],
          tools: [regenerateTool],
          tool_choice: { type: "tool", name: "report_finding" },
        });

        const truncated = response.stop_reason === "max_tokens";
        const toolUseBlock = response.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );
        if (!toolUseBlock) {
          throw new Error(
            "Anthropic API did not return expected tool_use block for report_finding"
          );
        }
        const fixed = validateAndNormalizeRegenerated(toolUseBlock.input, lang);
        return {
          result: fixed,
          outcome: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null,
            truncated,
            metadata: { stop_reason: response.stop_reason },
          },
        };
      },
      this.recorder,
      usageLogger
    );
  }
}

// ---------------------------------------------------------------------------
// OpenAICompatibleAdapter
// ---------------------------------------------------------------------------

function makeOpenAIFindingsTool(lang: OutputLanguage): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: "report_findings",
      description: "Report code review findings for the given pull request diff.",
      parameters: buildFindingsSchema(lang),
    },
  };
}

function makeOpenAISummaryTool(lang: OutputLanguage): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: "report_summary",
      description: "Report a concise overall summary and key highlights for the given pull request diff.",
      parameters: buildSummarySchema(lang),
    },
  };
}

function makeOpenAIVerifyTool(lang: OutputLanguage): OpenAI.Chat.Completions.ChatCompletionTool {
  const itemRequired = buildFindingsItemRequired(lang);
  return {
    type: "function",
    function: {
      name: "verify_finding",
      description: "Audit a draft code review finding and return verdict.",
      parameters: buildVerifySchema(itemRequired),
    },
  };
}

function makeOpenAIRegenerateTool(lang: OutputLanguage): OpenAI.Chat.Completions.ChatCompletionTool {
  const itemRequired = buildFindingsItemRequired(lang);
  return {
    type: "function",
    function: {
      name: "report_finding",
      description: "Return a corrected single finding after auditor rejection.",
      parameters: buildRegenerateSchema(itemRequired),
    },
  };
}

export class OpenAICompatibleAdapter implements AiAdapter {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly recorder: UsageRecorder;
  private readonly provider: AiProvider;

  constructor(config: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    provider?: AiProvider;
    recorder?: UsageRecorder;
  }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model;
    this.provider = config.provider ?? "openai";
    this.recorder = config.recorder ?? noopUsageRecorder;
  }

  /**
   * tool_choice 策略：统一使用 "auto"。
   * DeepSeek 多个模型（reasoner、v4-pro 等）不支持 "required"，
   * 强制使用会导致 400 错误。JSON 截断问题通过 repairTruncatedJson 兜底。
   */
  private toolChoice(): "auto" | "required" {
    return "auto";
  }

  async generateReviewFindings(context: ReviewContext): Promise<ReviewResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      return { findings: [] };
    }
    const lang = context.outputLanguage;
    const findingsTool = makeOpenAIFindingsTool(lang);
    const systemPrompt = buildSystemPrompt(lang);

    return withUsageInstrumentation(
      buildUsageCtx(context, this.provider, this.model, "review_findings"),
      async () => {
        const MAX_ROUNDS = 6;
        const MAX_FORMAT_RETRIES = 3;

        const allFindings: ReviewFinding[] = [];
        let previousFindings: ReviewFinding[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let anyTruncated = false;

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const userMsg =
            round === 0
              ? buildUserMessage(context, diffText)
              : buildContinuationMessage(context, diffText, previousFindings);

          let formatRetries = 0;
          let parsed: unknown = undefined;
          let roundTruncated = false;
          let lastFormatError: string | undefined;

          while (formatRetries <= MAX_FORMAT_RETRIES && parsed === undefined) {
            const retryMsg =
              formatRetries === 0
                ? userMsg
                : lastFormatError
                  ? `Your previous response had invalid tool input: "${lastFormatError}". Please ensure 'findings' is a JSON array of objects with all required fields (filePath, startLine, endLine, title, summary, suggestion, aiPrompt). Call the report_findings tool again.\n\n${userMsg}`
                  : `Please call the report_findings tool with valid JSON. Do not leave string fields empty or unclosed.\n\n${userMsg}`;
            try {
              log("info", "OpenAI batch round start", {
                prNumber: context.prNumber,
                round,
                attempt: formatRetries,
              });
              const response = await this.client.chat.completions.create({
                model: this.model,
                max_tokens: 16384,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: retryMsg },
                ],
                tools: [findingsTool],
                tool_choice: this.toolChoice(),
              });

              const choice = response.choices[0];
              totalInputTokens += response.usage?.prompt_tokens ?? 0;
              totalOutputTokens += response.usage?.completion_tokens ?? 0;
              roundTruncated = choice?.finish_reason === "length";
              if (roundTruncated) anyTruncated = true;
              log("info", "OpenAI batch round done", {
                prNumber: context.prNumber,
                round,
                attempt: formatRetries,
                finish_reason: choice?.finish_reason,
                has_tool_call: !!choice?.message?.tool_calls?.[0],
                input_tokens: response.usage?.prompt_tokens,
                output_tokens: response.usage?.completion_tokens,
                truncated: roundTruncated,
              });

              const toolCall = choice?.message?.tool_calls?.[0];

              if (toolCall && toolCall.type === "function") {
                if (toolCall.function.name !== "report_findings") {
                  formatRetries++;
                  continue;
                }
                try {
                  parsed = JSON.parse(toolCall.function.arguments);
                  try {
                    validateAndNormalizeFindings(parsed, lang);
                  } catch (validationErr) {
                    lastFormatError = validationErr instanceof Error ? validationErr.message : String(validationErr);
                    log("warn", "OpenAI tool input validation failed, will retry", {
                      prNumber: context.prNumber,
                      round,
                      attempt: formatRetries,
                      error: lastFormatError,
                    });
                    parsed = undefined;
                  }
                } catch {
                  if (roundTruncated) {
                    try {
                      parsed = repairTruncatedJson(toolCall.function.arguments);
                      try {
                        validateAndNormalizeFindings(parsed, lang);
                      } catch (validationErr) {
                        lastFormatError = validationErr instanceof Error ? validationErr.message : String(validationErr);
                        log("warn", "OpenAI truncated JSON validation failed, will retry", {
                          prNumber: context.prNumber,
                          round,
                          attempt: formatRetries,
                          error: lastFormatError,
                        });
                        parsed = undefined;
                      }
                    } catch {
                      // repair also failed
                    }
                  }
                  if (parsed === undefined) formatRetries++;
                }
              } else {
                const content =
                  typeof choice?.message?.content === "string"
                    ? choice.message.content
                    : undefined;
                parsed = extractJsonFromText(content);
                if (parsed !== undefined) {
                  try {
                    validateAndNormalizeFindings(parsed, lang);
                  } catch (validationErr) {
                    lastFormatError = validationErr instanceof Error ? validationErr.message : String(validationErr);
                    log("warn", "OpenAI text extraction validation failed, will retry", {
                      prNumber: context.prNumber,
                      round,
                      attempt: formatRetries,
                      error: lastFormatError,
                    });
                    parsed = undefined;
                  }
                }
                if (parsed === undefined) formatRetries++;
              }
            } catch (apiErr) {
              log("warn", "OpenAI API error in batch round", {
                prNumber: context.prNumber,
                round,
                attempt: formatRetries,
                error: apiErr instanceof Error ? apiErr.message : String(apiErr),
              });
              break;
            }
          }

          if (parsed === undefined) {
            log("warn", "OpenAI batch round skipped (no parsed result)", {
              prNumber: context.prNumber,
              round,
            });
            continue;
          }

          const data = parsed as Record<string, unknown>;
          const hasMore = data.hasMore === true;
          const newFindings = validateAndNormalizeFindings(parsed, lang);
          log("info", "OpenAI batch round parsed", {
            prNumber: context.prNumber,
            round,
            findingsCount: newFindings.length,
            hasMore,
            truncated: roundTruncated,
          });

          allFindings.push(...newFindings);
          previousFindings = newFindings;

          if (!hasMore) {
            if (roundTruncated && newFindings.length > 0) continue;
            break;
          }
          if (newFindings.length === 0) break;
        }

        return {
          result: { findings: deduplicateFindings(allFindings) },
          outcome: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            truncated: anyTruncated,
            metadata: {},
          },
        };
      },
      this.recorder,
      usageLogger
    );
  }

  async generateReviewSummary(
    context: ReviewContext
  ): Promise<ReviewSummaryResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      const isZh = context.outputLanguage === "zh-CN";
      return {
        summary: {
          summaryMd_en: isZh ? "" : "_No textual diff to summarize._",
          summaryMd_zh: isZh ? "_本次 PR 没有可用于总结的代码 diff。_" : "",
          highlights_en: [],
          highlights_zh: [],
          mermaid_flow: "",
        },
      };
    }
    const lang = context.outputLanguage;
    const summaryTool = makeOpenAISummaryTool(lang);
    const systemPrompt = buildSummarySystemPrompt(lang);

    return withUsageInstrumentation(
      buildUsageCtx(context, this.provider, this.model, "review_summary"),
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 16384,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: buildSummaryUserMessage(context, diffText),
            },
          ],
          tools: [summaryTool],
          tool_choice: this.toolChoice(),
        });

        const choice = response.choices[0];
        log("info", "OpenAI-compatible API summary call succeeded", {
          prNumber: context.prNumber,
          finish_reason: choice?.finish_reason,
        });

        const truncated = choice?.finish_reason === "length";
        const toolCall = choice?.message?.tool_calls?.[0];
        let parsed: unknown;

        if (toolCall && toolCall.type === "function") {
          if (toolCall.function.name !== "report_summary") {
            throw new Error(
              "OpenAI-compatible API did not return expected tool call for report_summary"
            );
          }
          try {
            parsed = JSON.parse(toolCall.function.arguments);
          } catch {
            throw new Error(
              `Failed to parse report_summary arguments: ${toolCall.function.arguments}`
            );
          }
        } else {
          const content =
            typeof choice?.message?.content === "string"
              ? choice.message.content
              : undefined;
          parsed = extractJsonFromText(content);
          if (parsed === undefined) {
            throw new Error(
              "OpenAI-compatible API did not return expected tool call for report_summary"
            );
          }
          log("info", "OpenAI-compatible summary parsed via content fallback", {
            prNumber: context.prNumber,
          });
        }

        const summary = validateAndNormalizeSummary(parsed, lang);
        return {
          result: { summary },
          outcome: {
            inputTokens: response.usage?.prompt_tokens ?? null,
            outputTokens: response.usage?.completion_tokens ?? null,
            truncated,
            metadata: { finish_reason: choice?.finish_reason },
          },
        };
      },
      this.recorder,
      usageLogger
    );
  }

  async verifyFinding(
    finding: ReviewFinding,
    context: ReviewContext
  ): Promise<CritiqueResult> {
    const lang = context.outputLanguage;
    const verifyTool = makeOpenAIVerifyTool(lang);
    return withUsageInstrumentation(
      {
        ...buildUsageCtx(context, this.provider, this.model, "verify_finding"),
        agentRole: "critic",
        attemptNumber: 0,
      },
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 16384,
          messages: [
            { role: "system", content: buildVerifySystemPrompt(lang) },
            { role: "user", content: buildVerifyUserMessage(finding, context) },
          ],
          tools: [verifyTool],
          tool_choice: this.toolChoice(),
        });

        const choice = response.choices[0];
        const truncated = choice?.finish_reason === "length";
        const toolCall = choice?.message?.tool_calls?.[0];
        let parsed: unknown;
        if (toolCall && toolCall.type === "function") {
          if (toolCall.function.name !== "verify_finding") {
            throw new Error(
              "OpenAI-compatible API did not return expected tool call for verify_finding"
            );
          }
          try {
            parsed = JSON.parse(toolCall.function.arguments);
          } catch {
            throw new Error(
              `Failed to parse verify_finding arguments: ${toolCall.function.arguments}`
            );
          }
        } else {
          const content =
            typeof choice?.message?.content === "string"
              ? choice.message.content
              : undefined;
          parsed = extractJsonFromText(content);
          if (parsed === undefined) {
            throw new Error(
              "OpenAI-compatible API did not return expected tool call for verify_finding"
            );
          }
        }
        const critique = validateAndNormalizeCritique(parsed);
        return {
          result: critique,
          outcome: {
            inputTokens: response.usage?.prompt_tokens ?? null,
            outputTokens: response.usage?.completion_tokens ?? null,
            truncated,
            metadata: { finish_reason: choice?.finish_reason },
          },
        };
      },
      this.recorder,
      usageLogger
    );
  }

  async regenerateFinding(
    finding: ReviewFinding,
    critique: CritiqueResult,
    context: ReviewContext
  ): Promise<ReviewFinding> {
    const lang = context.outputLanguage;
    const regenerateTool = makeOpenAIRegenerateTool(lang);
    return withUsageInstrumentation(
      {
        ...buildUsageCtx(context, this.provider, this.model, "regenerate_finding"),
        agentRole: "regenerator",
        attemptNumber: 0,
      },
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 16384,
          messages: [
            { role: "system", content: buildRegenerateSystemPrompt(lang) },
            {
              role: "user",
              content: buildRegenerateUserMessage(finding, critique, context),
            },
          ],
          tools: [regenerateTool],
          tool_choice: this.toolChoice(),
        });

        const choice = response.choices[0];
        const truncated = choice?.finish_reason === "length";
        const toolCall = choice?.message?.tool_calls?.[0];
        let parsed: unknown;
        if (toolCall && toolCall.type === "function") {
          if (toolCall.function.name !== "report_finding") {
            throw new Error(
              "OpenAI-compatible API did not return expected tool call for report_finding"
            );
          }
          try {
            parsed = JSON.parse(toolCall.function.arguments);
          } catch {
            throw new Error(
              `Failed to parse report_finding arguments: ${toolCall.function.arguments}`
            );
          }
        } else {
          const content =
            typeof choice?.message?.content === "string"
              ? choice.message.content
              : undefined;
          parsed = extractJsonFromText(content);
          if (parsed === undefined) {
            throw new Error(
              "OpenAI-compatible API did not return expected tool call for report_finding"
            );
          }
        }
        const fixed = validateAndNormalizeRegenerated(parsed, lang);
        return {
          result: fixed,
          outcome: {
            inputTokens: response.usage?.prompt_tokens ?? null,
            outputTokens: response.usage?.completion_tokens ?? null,
            truncated,
            metadata: { finish_reason: choice?.finish_reason },
          },
        };
      },
      this.recorder,
      usageLogger
    );
  }
}

// ---------------------------------------------------------------------------
// FallbackAdapter
// ---------------------------------------------------------------------------

export class FallbackAdapter implements AiAdapter {
  private readonly primary: AiAdapter;
  private readonly fallbacks: AiAdapter[];

  constructor(primary: AiAdapter, fallbacks: AiAdapter[]) {
    this.primary = primary;
    this.fallbacks = fallbacks;
  }

  async generateReviewFindings(context: ReviewContext): Promise<ReviewResult> {
    return this.withFallback("generateReviewFindings", context);
  }

  async generateReviewSummary(context: ReviewContext): Promise<ReviewSummaryResult> {
    return this.withFallback("generateReviewSummary", context);
  }

  async verifyFinding(
    finding: ReviewFinding,
    context: ReviewContext
  ): Promise<CritiqueResult> {
    return this.withFallback("verifyFinding", finding, context);
  }

  async regenerateFinding(
    finding: ReviewFinding,
    critique: CritiqueResult,
    context: ReviewContext
  ): Promise<ReviewFinding> {
    return this.withFallback("regenerateFinding", finding, critique, context);
  }

  private async withFallback<T>(
    method: keyof AiAdapter,
    ...args: unknown[]
  ): Promise<T> {
    try {
      return await (this.primary[method] as Function)(...args);
    } catch (err) {
      if (this.isRetryableError(err) && this.fallbacks.length > 0) {
        log("warn", "Primary provider failed, trying fallback", {
          method,
          error: err instanceof Error ? err.message : String(err),
        });
        return await (this.fallbacks[0]![method] as Function)(...args);
      }
      throw err;
    }
  }

  private isRetryableError(err: unknown): boolean {
    if (err instanceof AppError) {
      return (
        err.code === ErrorCode.ModelInvocationTimeout ||
        err.code === ErrorCode.ModelInvocationProviderUnavailable ||
        err.code === ErrorCode.ModelInvocationRateLimit
      );
    }
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return (
        msg.includes("timeout") ||
        msg.includes("503") ||
        msg.includes("502") ||
        msg.includes("econnreset")
      );
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const ALIBABA_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export function createAdapter(
  config: AiAdapterConfig,
  recorder: UsageRecorder = noopUsageRecorder
): AiAdapter {
  if (config.provider === "anthropic") {
    return new AnthropicAdapter({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      recorder,
    });
  }

  const baseUrl =
    config.baseUrl ?? (config.provider === "alibaba" ? ALIBABA_BASE_URL : undefined);

  return new OpenAICompatibleAdapter({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl,
    provider: config.provider,
    recorder,
  });
}

export function createAdapterWithFallback(
  primary: AiAdapterConfig,
  fallbacks: AiAdapterConfig[],
  recorder: UsageRecorder = noopUsageRecorder
): AiAdapter {
  const primaryAdapter = createAdapter(primary, recorder);
  if (fallbacks.length === 0) return primaryAdapter;
  const fallbackAdapters = fallbacks.map((f) => createAdapter(f, recorder));
  return new FallbackAdapter(primaryAdapter, fallbackAdapters);
}

// ---------------------------------------------------------------------------
// Test-only export. Do NOT use from production code.
// ---------------------------------------------------------------------------

export const _internalForTest = {
  buildUserMessage,
  buildSummaryUserMessage,
  validateAndNormalizeFindings,
  validateAndNormalizeSummary,
};
