import Anthropic from "@anthropic-ai/sdk";
import type { AiProviderConfig } from "./config.js";
import type { ReviewContext, ReviewFinding, ReviewResult } from "./types.js";

// ---------------------------------------------------------------------------
// Internal log helper (packages/ai must not depend on @reviewer/core)
// ---------------------------------------------------------------------------

function log(
  level: "info" | "warn" | "error",
  msg: string,
  extra?: Record<string, unknown>
) {
  const line = JSON.stringify({ level, component: "ai-review", msg, ...extra });
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const REPORT_FINDINGS_TOOL: Anthropic.Tool = {
  name: "report_findings",
  description: "Report code review findings for the given pull request diff.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            startLine: { type: "integer" },
            endLine: { type: "integer" },
            side: { type: "string", enum: ["LEFT", "RIGHT"] },
            issueType: { type: "string", enum: ["quality", "security"] },
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
            },
            title: { type: "string" },
            summary: { type: "string" },
            suggestion: { type: "string" },
            confidenceScore: { type: "number", minimum: 0, maximum: 1 },
          },
          required: [
            "filePath",
            "startLine",
            "endLine",
            "side",
            "issueType",
            "severity",
            "title",
            "summary",
            "suggestion",
            "confidenceScore",
          ],
        },
      },
    },
    required: ["findings"],
  },
};

// ---------------------------------------------------------------------------
// Diff builder with size limit
// ---------------------------------------------------------------------------

const MAX_DIFF_CHARS = 80_000;

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

// ---------------------------------------------------------------------------
// Tool input validation
// ---------------------------------------------------------------------------

const REQUIRED_FINDING_FIELDS = [
  "filePath",
  "startLine",
  "endLine",
  "title",
  "summary",
  "suggestion",
] as const;

function validateAndNormalizeFindings(input: unknown): ReviewFinding[] {
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.findings)) {
    throw new Error("Anthropic tool input: 'findings' must be an array");
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

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateReviewFindings(
  context: ReviewContext,
  config: AiProviderConfig,
  apiKey: string
): Promise<ReviewResult> {
  if (config.provider !== "anthropic") {
    throw new Error(
      `[ai] generateReviewFindings only supports 'anthropic' provider, got '${config.provider}'`
    );
  }

  const diffText = buildDiffText(context);
  if (!diffText) {
    return { findings: [] };
  }

  const client = new Anthropic({ apiKey });

  const userMessage = `You are reviewing pull request #${context.prNumber} in repository ${context.fullName} (head SHA: ${context.headSha}).

Please analyze the following diff and call the \`report_findings\` tool with all real issues you find. Only report findings with genuine impact — avoid noise and style nitpicks unless they indicate a real problem.

<diff>
${diffText}
</diff>`;

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system:
        "You are a senior code reviewer. Your job is to identify real, impactful issues in code changes — bugs, security vulnerabilities, logic errors, and serious quality problems. Avoid reporting trivial style issues. Be precise about file paths and line numbers.",
      messages: [{ role: "user", content: userMessage }],
      tools: [REPORT_FINDINGS_TOOL],
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
