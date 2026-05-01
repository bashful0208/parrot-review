import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import type {
  CritiqueResult,
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

const SUMMARY_SCHEMA = {
  type: "object" as const,
  properties: {
    summaryMd_en: { type: "string" as const },
    summaryMd_zh: { type: "string" as const },
    highlights_en: {
      type: "array" as const,
      items: { type: "string" as const },
    },
    highlights_zh: {
      type: "array" as const,
      items: { type: "string" as const },
    },
    mermaid_flow: { type: "string" as const },
  },
  required: [
    "summaryMd_en",
    "summaryMd_zh",
    "highlights_en",
    "highlights_zh",
    "mermaid_flow",
  ] as string[],
};

const FINDINGS_SCHEMA = {
  type: "object" as const,
  properties: {
    findings: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          filePath: { type: "string" as const },
          startLine: { type: "integer" as const },
          endLine: { type: "integer" as const },
          side: { type: "string" as const, enum: ["LEFT", "RIGHT"] },
          issueType: { type: "string" as const, enum: ["quality", "security"] },
          severity: {
            type: "string" as const,
            enum: ["low", "medium", "high", "critical"],
          },
          title_en: { type: "string" as const },
          title_zh: { type: "string" as const },
          summary_en: { type: "string" as const },
          summary_zh: { type: "string" as const },
          suggestion_en: { type: "string" as const },
          suggestion_zh: { type: "string" as const },
          aiPrompt: { type: "string" as const },
          confidenceScore: { type: "number" as const, minimum: 0, maximum: 1 },
        },
        required: [
          "filePath",
          "startLine",
          "endLine",
          "side",
          "issueType",
          "severity",
          "title_en",
          "title_zh",
          "summary_en",
          "summary_zh",
          "suggestion_en",
          "suggestion_zh",
          "aiPrompt",
          "confidenceScore",
        ] as string[],
      },
    },
  },
  required: ["findings"] as string[],
};

const FINDING_ITEM_SCHEMA = FINDINGS_SCHEMA.properties.findings.items;

const VERIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    valid: { type: "boolean" as const },
    reason: { type: "string" as const },
    confidenceScore: { type: "number" as const, minimum: 0, maximum: 1 },
    patchedFinding: {
      type: "object" as const,
      properties: FINDING_ITEM_SCHEMA.properties,
      required: FINDING_ITEM_SCHEMA.required,
    },
  },
  required: ["valid", "reason", "confidenceScore"] as string[],
};

const REGENERATE_SCHEMA = {
  type: "object" as const,
  properties: {
    finding: {
      type: "object" as const,
      properties: FINDING_ITEM_SCHEMA.properties,
      required: FINDING_ITEM_SCHEMA.required,
    },
  },
  required: ["finding"] as string[],
};

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

const REQUIRED_FINDING_FIELDS = [
  "filePath",
  "startLine",
  "endLine",
  "title_en",
  "title_zh",
  "summary_en",
  "summary_zh",
  "suggestion_en",
  "suggestion_zh",
  "aiPrompt",
] as const;

function validateAndNormalizeFindings(input: unknown): ReviewFinding[] {
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.findings)) {
    throw new Error("Tool input: 'findings' must be an array");
  }
  return (raw.findings as unknown[])
    .filter((item): item is Record<string, unknown> => {
      if (typeof item !== "object" || item === null) return false;
      const obj = item as Record<string, unknown>;
      return REQUIRED_FINDING_FIELDS.every(
        (k) => obj[k] !== undefined && obj[k] !== null
      );
    })
    .map((item) => ({
      ...(item as unknown as ReviewFinding),
      confidenceScore: Math.min(
        1,
        Math.max(0, (item.confidenceScore as number) ?? 0)
      ),
    }));
}

function buildUserMessage(context: ReviewContext, diffText: string): string {
  const focusBlock =
    context.focus === "quality"
      ? "Scope: report ONLY code quality / correctness / maintainability / performance issues. Do NOT report security issues — a separate reviewer covers them. Skip if you'd otherwise mark issueType=security.\n\n"
      : context.focus === "security"
        ? "Scope: report ONLY security issues (auth, injection, secrets, unsafe deserialization, SSRF, etc.). Do NOT report style or quality nitpicks — a separate reviewer covers them. Skip if you'd otherwise mark issueType=quality.\n\n"
        : "";

  return `You are reviewing pull request #${context.prNumber} in repository ${context.fullName} (head SHA: ${context.headSha}).

${focusBlock}Please analyze the following diff and call the \`report_findings\` tool with all real issues you find. Only report findings with genuine impact — avoid noise and style nitpicks unless they indicate a real problem.

For every finding produce both English and Simplified Chinese fields:

- \`title_en\` / \`title_zh\`: a short title (≤ 80 chars). The Chinese version is independently idiomatic, not a literal translation.
- \`summary_en\` / \`summary_zh\`: 1–3 sentences explaining the issue and its impact. Reference symbols / file paths verbatim.
- \`suggestion_en\` / \`suggestion_zh\`: a concrete fix suggestion. Keep code identifiers in their original form.

Both languages are required for every finding. Do not leave either side empty.

Additionally, every finding MUST include \`aiPrompt\`: a detailed, copy-pasteable English instruction targeted at an AI coding agent (Cursor / Claude Code / similar) that, on its own, gives the agent enough context to apply the fix end-to-end. Write it as a single self-contained paragraph (no markdown headings, no bullet lists). It must include:

- The exact file path (use the path verbatim from the diff, no \`@\` prefix), narrowed by line range or anchor symbol.
- A precise description of what is wrong with the current code (the failure mode or invariant violation), so the agent can verify before changing anything.
- A concrete description of the fix — names of new variables / data structures, the exact control-flow change, any imports or helpers to use, and what the post-fix code should look like at a high level.
- An explicit verification step the agent can do after the fix (a property to check, a test to add or run).

Aim for 80–250 English words. Prefer specifics over generality. Do not paste large code blocks; describe the change in prose, referring to identifiers by name.

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
      `${i + 1}. [${f.severity}/${f.issueType}] ${f.filePath}:${f.startLine}–${f.endLine} — ${f.title_en}`
  )
  .join("\n")}
</verified_findings>

These are the final, auditor-verified findings. Reference them when describing risks but do not duplicate the per-finding details.

`
      : "";

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

Call the \`report_summary\` tool with:

- \`summaryMd_en\`: a concise English Markdown overview (3–8 sentences) of what this PR changes and why. Reference file/module names where useful. Do not invent functionality not in the diff.
- \`summaryMd_zh\`: 等价的中文 Markdown 概述（3-8 句），独立成文，不是逐字翻译英文版本；保留专有名词和文件路径。
- \`highlights_en\`: 2–6 short bullet strings naming the most important changes, risks, or things to double-check.
- \`highlights_zh\`: 2-6 条对应中文要点，独立成文。
- \`mermaid_flow\`: if and only if the diff introduces or modifies a discernible execution flow, call chain, or state transition, output a mermaid block (e.g. \`\`\`mermaid sequenceDiagram ...\`\`\`). Otherwise output an empty string.`;
}

const SYSTEM_PROMPT =
  "You are a senior code reviewer. Your job is to identify real, impactful issues in code changes — bugs, security vulnerabilities, logic errors, and serious quality problems. Avoid reporting trivial style issues. Be precise about file paths and line numbers. " +
  "You produce every finding bilingually: English and Simplified Chinese versions of the title, summary, and suggestion that are independently idiomatic — not literal translations. Code identifiers, symbols, and file paths stay in their original form on both sides.";

const SUMMARY_SYSTEM_PROMPT =
  "You are a senior code reviewer summarizing a pull request for a teammate. " +
  "Be accurate, specific, and concise. Describe what changed and why; flag noteworthy risks. " +
  "Do not fabricate behavior that is not in the diff. " +
  "You produce both English and Simplified Chinese outputs that are independently idiomatic — not literal translations. " +
  "When the diff introduces or alters a clear execution flow, call chain, or state transition, output a mermaid diagram in the mermaid_flow field; otherwise leave it empty.";

const VERIFY_SYSTEM_PROMPT =
  "You are a code review auditor. Your only job is to verify whether a draft finding is correct and useful. Be skeptical: reject hallucinated bugs, mismatched line ranges, and findings whose suggestion does not actually fix the problem. When the finding is mostly right but flawed, return valid=false with patchedFinding fixed.";

const REGENERATE_SYSTEM_PROMPT =
  "You are a code reviewer fixing a draft finding that an auditor rejected. Read the auditor's reason carefully, then rewrite the finding so the issue is real, the line range matches the diff, and bilingual fields are complete. Return the corrected finding via the report_finding tool.";

function buildVerifyUserMessage(
  finding: ReviewFinding,
  context: ReviewContext
): string {
  const targetDiff =
    context.diffs.find((d) => d.filePath === finding.filePath)?.patch ??
    "(diff not found)";
  return `You are auditing a code review finding for pull request #${context.prNumber} in ${context.fullName}.

Decide whether the finding below is a real, well-formed issue worth posting to the developer.

A finding should be REJECTED (valid=false) if:
- the issue described is not actually present in the diff,
- the file path / line range does not match the actual change,
- the severity / issueType is grossly mismatched,
- the suggestion would not fix the problem or would make it worse,
- the bilingual fields are missing or one side is empty.

If the finding is mostly correct but has fixable defects, set valid=false AND populate patchedFinding with a corrected full ReviewFinding object.

If the finding is acceptable as-is, set valid=true and reason="ok".

<finding>
${JSON.stringify(finding, null, 2)}
</finding>

<diff_for_${finding.filePath}>
\`\`\`diff
${targetDiff}
\`\`\`
</diff_for_${finding.filePath}>

Call the \`verify_finding\` tool with your decision.`;
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
  return `Auditor rejected the following draft finding for pull request #${context.prNumber} in ${context.fullName}:

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

Rewrite the finding to address the auditor's reason. Keep the bilingual structure; do not regress existing-good fields. Call the \`report_finding\` tool with the corrected finding.`;
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

function validateAndNormalizeRegenerated(input: unknown): ReviewFinding {
  if (typeof input !== "object" || input === null) {
    throw new Error("Tool input: report_finding expected an object");
  }
  const obj = input as Record<string, unknown>;
  const finding = obj.finding as Record<string, unknown> | undefined;
  if (!finding || typeof finding !== "object") {
    throw new Error("Tool input: 'finding' must be an object");
  }
  for (const k of REQUIRED_FINDING_FIELDS) {
    if (finding[k] === undefined || finding[k] === null) {
      throw new Error(`Tool input: regenerated finding missing field '${k}'`);
    }
  }
  return {
    ...(finding as unknown as ReviewFinding),
    confidenceScore: Math.min(
      1,
      Math.max(0, (finding.confidenceScore as number) ?? 0)
    ),
  };
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

function validateAndNormalizeSummary(input: unknown): ReviewSummary {
  if (typeof input !== "object" || input === null) {
    throw new Error("Tool input: report_summary expected an object");
  }
  const obj = input as Record<string, unknown>;
  const en = obj.summaryMd_en;
  const zh = obj.summaryMd_zh;
  const hiEn = obj.highlights_en;
  const hiZh = obj.highlights_zh;
  const mermaid = obj.mermaid_flow;

  if (typeof en !== "string" || en.trim() === "") {
    throw new Error("Tool input: 'summaryMd_en' must be a non-empty string");
  }
  if (typeof zh !== "string" || zh.trim() === "") {
    throw new Error("Tool input: 'summaryMd_zh' must be a non-empty string");
  }
  if (!Array.isArray(hiEn)) {
    throw new Error("Tool input: 'highlights_en' must be an array");
  }
  if (!Array.isArray(hiZh)) {
    throw new Error("Tool input: 'highlights_zh' must be an array");
  }
  if (typeof mermaid !== "string") {
    throw new Error(
      "Tool input: 'mermaid_flow' must be a string (use empty string when no flow)"
    );
  }

  return {
    summaryMd_en: en,
    summaryMd_zh: zh,
    highlights_en: hiEn.filter(
      (h): h is string => typeof h === "string" && h.trim() !== ""
    ),
    highlights_zh: hiZh.filter(
      (h): h is string => typeof h === "string" && h.trim() !== ""
    ),
    mermaid_flow: mermaid,
  };
}

// ---------------------------------------------------------------------------
// AnthropicAdapter
// ---------------------------------------------------------------------------

const ANTHROPIC_TOOL: Anthropic.Tool = {
  name: "report_findings",
  description: "Report code review findings for the given pull request diff.",
  input_schema: FINDINGS_SCHEMA as Anthropic.Tool["input_schema"],
};

const ANTHROPIC_SUMMARY_TOOL: Anthropic.Tool = {
  name: "report_summary",
  description:
    "Report a concise overall summary and key highlights for the given pull request diff.",
  input_schema: SUMMARY_SCHEMA as Anthropic.Tool["input_schema"],
};

const ANTHROPIC_VERIFY_TOOL: Anthropic.Tool = {
  name: "verify_finding",
  description: "Audit a draft code review finding and return verdict.",
  input_schema: VERIFY_SCHEMA as Anthropic.Tool["input_schema"],
};

const ANTHROPIC_REGENERATE_TOOL: Anthropic.Tool = {
  name: "report_finding",
  description: "Return a corrected single finding after auditor rejection.",
  input_schema: REGENERATE_SCHEMA as Anthropic.Tool["input_schema"],
};

export class AnthropicAdapter implements AiAdapter {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly recorder: UsageRecorder;
  private readonly provider: AiProvider = "anthropic";

  constructor(config: {
    apiKey: string;
    model: string;
    recorder?: UsageRecorder;
  }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
    this.recorder = config.recorder ?? noopUsageRecorder;
  }

  async generateReviewFindings(context: ReviewContext): Promise<ReviewResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      return { findings: [] };
    }

    return withUsageInstrumentation(
      buildUsageCtx(context, this.provider, this.model, "review_findings"),
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserMessage(context, diffText) }],
          tools: [ANTHROPIC_TOOL],
          tool_choice: { type: "tool", name: "report_findings" },
        });

        log("info", "Anthropic API call succeeded", {
          prNumber: context.prNumber,
          stop_reason: response.stop_reason,
        });

        const truncated = response.stop_reason === "max_tokens";
        const toolUseBlock = response.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );

        if (!toolUseBlock) {
          throw new Error(
            "Anthropic API did not return expected tool_use block for report_findings"
          );
        }

        const findings = validateAndNormalizeFindings(toolUseBlock.input);
        return {
          result: { findings },
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

  async generateReviewSummary(
    context: ReviewContext
  ): Promise<ReviewSummaryResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      return {
        summary: {
          summaryMd_en: "_No textual diff to summarize._",
          summaryMd_zh: "_本次 PR 没有可用于总结的代码 diff。_",
          highlights_en: [],
          highlights_zh: [],
          mermaid_flow: "",
        },
      };
    }

    return withUsageInstrumentation(
      buildUsageCtx(context, this.provider, this.model, "review_summary"),
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 2048,
          system: SUMMARY_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: buildSummaryUserMessage(context, diffText) },
          ],
          tools: [ANTHROPIC_SUMMARY_TOOL],
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

        const summary = validateAndNormalizeSummary(toolUseBlock.input);
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
    return withUsageInstrumentation(
      {
        ...buildUsageCtx(context, this.provider, this.model, "verify_finding"),
        agentRole: "critic",
        attemptNumber: 0,
      },
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 2048,
          system: VERIFY_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: buildVerifyUserMessage(finding, context) },
          ],
          tools: [ANTHROPIC_VERIFY_TOOL],
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
    return withUsageInstrumentation(
      {
        ...buildUsageCtx(context, this.provider, this.model, "regenerate_finding"),
        agentRole: "regenerator",
        attemptNumber: 0,
      },
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: REGENERATE_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: buildRegenerateUserMessage(finding, critique, context),
            },
          ],
          tools: [ANTHROPIC_REGENERATE_TOOL],
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
        const fixed = validateAndNormalizeRegenerated(toolUseBlock.input);
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

const OPENAI_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "report_findings",
    description: "Report code review findings for the given pull request diff.",
    parameters: FINDINGS_SCHEMA,
  },
};

const OPENAI_SUMMARY_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "report_summary",
    description:
      "Report a concise overall summary and key highlights for the given pull request diff.",
    parameters: SUMMARY_SCHEMA,
  },
};

const OPENAI_VERIFY_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "verify_finding",
    description: "Audit a draft code review finding and return verdict.",
    parameters: VERIFY_SCHEMA,
  },
};

const OPENAI_REGENERATE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "report_finding",
    description: "Return a corrected single finding after auditor rejection.",
    parameters: REGENERATE_SCHEMA,
  },
};

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

  async generateReviewFindings(context: ReviewContext): Promise<ReviewResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      return { findings: [] };
    }

    return withUsageInstrumentation(
      buildUsageCtx(context, this.provider, this.model, "review_findings"),
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserMessage(context, diffText) },
          ],
          tools: [OPENAI_TOOL],
          tool_choice: "auto",
        });

        const choice = response.choices[0];
        log("info", "OpenAI-compatible API call succeeded", {
          prNumber: context.prNumber,
          finish_reason: choice?.finish_reason,
        });

        const truncated = choice?.finish_reason === "length";
        const toolCall = choice?.message?.tool_calls?.[0];
        let parsed: unknown;

        if (toolCall && toolCall.type === "function") {
          if (toolCall.function.name !== "report_findings") {
            throw new Error(
              "OpenAI-compatible API did not return expected tool call for report_findings"
            );
          }
          try {
            parsed = JSON.parse(toolCall.function.arguments);
          } catch {
            throw new Error(
              `Failed to parse report_findings arguments: ${toolCall.function.arguments}`
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
              "OpenAI-compatible API did not return expected tool call for report_findings"
            );
          }
          log("info", "OpenAI-compatible findings parsed via content fallback", {
            prNumber: context.prNumber,
          });
        }

        const findings = validateAndNormalizeFindings(parsed);
        return {
          result: { findings },
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

  async generateReviewSummary(
    context: ReviewContext
  ): Promise<ReviewSummaryResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      return {
        summary: {
          summaryMd_en: "_No textual diff to summarize._",
          summaryMd_zh: "_本次 PR 没有可用于总结的代码 diff。_",
          highlights_en: [],
          highlights_zh: [],
          mermaid_flow: "",
        },
      };
    }

    return withUsageInstrumentation(
      buildUsageCtx(context, this.provider, this.model, "review_summary"),
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 2048,
          messages: [
            { role: "system", content: SUMMARY_SYSTEM_PROMPT },
            {
              role: "user",
              content: buildSummaryUserMessage(context, diffText),
            },
          ],
          tools: [OPENAI_SUMMARY_TOOL],
          tool_choice: "auto",
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

        const summary = validateAndNormalizeSummary(parsed);
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
    return withUsageInstrumentation(
      {
        ...buildUsageCtx(context, this.provider, this.model, "verify_finding"),
        agentRole: "critic",
        attemptNumber: 0,
      },
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 2048,
          messages: [
            { role: "system", content: VERIFY_SYSTEM_PROMPT },
            { role: "user", content: buildVerifyUserMessage(finding, context) },
          ],
          tools: [OPENAI_VERIFY_TOOL],
          tool_choice: "auto",
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
    return withUsageInstrumentation(
      {
        ...buildUsageCtx(context, this.provider, this.model, "regenerate_finding"),
        agentRole: "regenerator",
        attemptNumber: 0,
      },
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 4096,
          messages: [
            { role: "system", content: REGENERATE_SYSTEM_PROMPT },
            {
              role: "user",
              content: buildRegenerateUserMessage(finding, critique, context),
            },
          ],
          tools: [OPENAI_REGENERATE_TOOL],
          tool_choice: "auto",
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
        const fixed = validateAndNormalizeRegenerated(parsed);
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

// ---------------------------------------------------------------------------
// Test-only export. Do NOT use from production code.
// ---------------------------------------------------------------------------

export const _internalForTest = {
  buildUserMessage,
  buildSummaryUserMessage,
  validateAndNormalizeFindings,
  validateAndNormalizeSummary,
};
