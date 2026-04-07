import Anthropic from "@anthropic-ai/sdk";
import type { AiProviderConfig } from "./config.js";
import type { ReviewContext, ReviewFinding, ReviewResult } from "./types.js";

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

function buildDiffText(context: ReviewContext): string {
  const parts: string[] = [];
  for (const diff of context.diffs) {
    if (!diff.patch) continue;
    parts.push(
      `### File: ${diff.filePath}\n\`\`\`diff\n${diff.patch}\n\`\`\``
    );
  }
  return parts.join("\n\n");
}

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

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 4096,
    system:
      "You are a senior code reviewer. Your job is to identify real, impactful issues in code changes — bugs, security vulnerabilities, logic errors, and serious quality problems. Avoid reporting trivial style issues. Be precise about file paths and line numbers.",
    messages: [{ role: "user", content: userMessage }],
    tools: [REPORT_FINDINGS_TOOL],
    tool_choice: { type: "tool", name: "report_findings" },
  });

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUseBlock) {
    return { findings: [] };
  }

  const input = toolUseBlock.input as { findings: ReviewFinding[] };
  return { findings: input.findings ?? [] };
}
