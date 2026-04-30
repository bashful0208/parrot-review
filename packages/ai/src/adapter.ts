import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type {
  ReviewContext,
  ReviewFinding,
  ReviewResult,
  ReviewSummary,
  ReviewSummaryResult,
} from "./types.js";

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

export interface AiAdapter {
  generateReviewFindings(context: ReviewContext): Promise<ReviewResult>;
  generateReviewSummary(context: ReviewContext): Promise<ReviewSummaryResult>;
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
          "confidenceScore",
        ] as string[],
      },
    },
  },
  required: ["findings"] as string[],
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
  return `You are reviewing pull request #${context.prNumber} in repository ${context.fullName} (head SHA: ${context.headSha}).

Please analyze the following diff and call the \`report_findings\` tool with all real issues you find. Only report findings with genuine impact — avoid noise and style nitpicks unless they indicate a real problem.

For every finding produce both English and Simplified Chinese fields:

- \`title_en\` / \`title_zh\`: a short title (≤ 80 chars). The Chinese version is independently idiomatic, not a literal translation.
- \`summary_en\` / \`summary_zh\`: 1–3 sentences explaining the issue and its impact. Reference symbols / file paths verbatim.
- \`suggestion_en\` / \`suggestion_zh\`: a concrete fix suggestion. Keep code identifiers in their original form.

Both languages are required for every finding. Do not leave either side empty.

<diff>
${diffText}
</diff>`;
}

function buildSummaryUserMessage(context: ReviewContext, diffText: string): string {
  const guidelines = context.guidelines ?? "";
  const projectContext = context.projectContext ?? "";

  return `You are summarizing pull request #${context.prNumber} in repository ${context.fullName} (head SHA: ${context.headSha}).

<reviewer_guidelines>
${guidelines}
</reviewer_guidelines>

<project_context>
${projectContext}
</project_context>

<diff>
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

export class AnthropicAdapter implements AiAdapter {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async generateReviewFindings(context: ReviewContext): Promise<ReviewResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      return { findings: [] };
    }

    let response: Awaited<ReturnType<typeof this.client.messages.create>>;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(context, diffText) }],
        tools: [ANTHROPIC_TOOL],
        tool_choice: { type: "tool", name: "report_findings" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("error", "Anthropic API call failed", { error: message });
      throw new Error(`Anthropic API call failed: ${message}`);
    }

    log("info", "Anthropic API call succeeded", {
      prNumber: context.prNumber,
      stop_reason: response.stop_reason,
    });

    if (response.stop_reason === "max_tokens") {
      throw new Error("Anthropic API response was truncated (max_tokens)");
    }

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUseBlock) {
      throw new Error(
        "Anthropic API did not return expected tool_use block for report_findings"
      );
    }

    const findings = validateAndNormalizeFindings(toolUseBlock.input);
    return { findings };
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

    let response: Awaited<ReturnType<typeof this.client.messages.create>>;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildSummaryUserMessage(context, diffText) },
        ],
        tools: [ANTHROPIC_SUMMARY_TOOL],
        tool_choice: { type: "tool", name: "report_summary" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("error", "Anthropic API summary call failed", { error: message });
      throw new Error(`Anthropic API summary call failed: ${message}`);
    }

    log("info", "Anthropic API summary call succeeded", {
      prNumber: context.prNumber,
      stop_reason: response.stop_reason,
    });

    if (response.stop_reason === "max_tokens") {
      throw new Error("Anthropic API summary response was truncated (max_tokens)");
    }

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUseBlock) {
      throw new Error(
        "Anthropic API did not return expected tool_use block for report_summary"
      );
    }

    const summary = validateAndNormalizeSummary(toolUseBlock.input);
    return { summary };
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

export class OpenAICompatibleAdapter implements AiAdapter {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: { apiKey: string; model: string; baseUrl?: string }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model;
  }

  async generateReviewFindings(context: ReviewContext): Promise<ReviewResult> {
    const diffText = buildDiffText(context);
    if (!diffText) {
      return { findings: [] };
    }

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(context, diffText) },
        ],
        tools: [OPENAI_TOOL],
        tool_choice: "auto",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("error", "OpenAI-compatible API call failed", { error: message });
      throw new Error(`OpenAI-compatible API call failed: ${message}`);
    }

    const choice = response.choices[0];
    log("info", "OpenAI-compatible API call succeeded", {
      prNumber: context.prNumber,
      finish_reason: choice?.finish_reason,
    });

    if (choice?.finish_reason === "length") {
      throw new Error("OpenAI-compatible API response was truncated (length)");
    }

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
    return { findings };
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

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client.chat.completions.create({
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("error", "OpenAI-compatible API summary call failed", { error: message });
      throw new Error(`OpenAI-compatible API summary call failed: ${message}`);
    }

    const choice = response.choices[0];
    log("info", "OpenAI-compatible API summary call succeeded", {
      prNumber: context.prNumber,
      finish_reason: choice?.finish_reason,
    });

    if (choice?.finish_reason === "length") {
      throw new Error("OpenAI-compatible API summary response was truncated (length)");
    }

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
    return { summary };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const ALIBABA_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export function createAdapter(config: AiAdapterConfig): AiAdapter {
  if (config.provider === "anthropic") {
    return new AnthropicAdapter({ apiKey: config.apiKey, model: config.model });
  }

  const baseUrl =
    config.baseUrl ?? (config.provider === "alibaba" ? ALIBABA_BASE_URL : undefined);

  return new OpenAICompatibleAdapter({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl,
  });
}
