import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AnthropicAdapter, OpenAICompatibleAdapter } from "./adapter.js";
import type { ReviewContext, ReviewFinding } from "./types.js";

const ctx: ReviewContext = {
  fullName: "owner/repo",
  prNumber: 1,
  headSha: "h",
  diffs: [
    { filePath: "a.ts", patch: "@@\n+x\n", oldFilePath: null, status: "modified" } as never,
  ],
  guidelines: "",
  projectContext: "",
  organizationId: "o",
  repositoryId: "r",
  pullRequestId: "p",
  reviewRunId: "rr",
  providerConfigId: "pc",
  outputLanguage: "en-US",
};

const sample: ReviewFinding = {
  filePath: "a.ts",
  startLine: 1,
  endLine: 1,
  side: "RIGHT",
  issueType: "quality",
  severity: "low",
  title_en: "T",
  title_zh: "标",
  summary_en: "s",
  summary_zh: "总",
  suggestion_en: "g",
  suggestion_zh: "建",
  aiPrompt: "p",
  confidenceScore: 0.5,
};

const fixed: ReviewFinding = { ...sample, startLine: 5, endLine: 5, title_en: "FIXED" };

describe("AnthropicAdapter.verifyFinding", () => {
  it("returns valid=true when LLM tool says ok", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "test", model: "claude-x" });
    (adapter as unknown as { client: { messages: { create: unknown } } }).client = {
      messages: {
        create: async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [
            {
              type: "tool_use",
              name: "verify_finding",
              input: { valid: true, reason: "ok", confidenceScore: 0.9 },
            },
          ],
        }),
      },
    };

    const result = await adapter.verifyFinding(sample, ctx);
    assert.equal(result.valid, true);
    assert.equal(result.reason, "ok");
    assert.equal(result.confidenceScore, 0.9);
    assert.equal(result.patchedFinding, undefined);
  });

  it("clamps confidenceScore into [0,1]", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "test", model: "claude-x" });
    (adapter as unknown as { client: { messages: { create: unknown } } }).client = {
      messages: {
        create: async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [
            {
              type: "tool_use",
              name: "verify_finding",
              input: { valid: false, reason: "x", confidenceScore: 5 },
            },
          ],
        }),
      },
    };
    const r = await adapter.verifyFinding(sample, ctx);
    assert.equal(r.confidenceScore, 1);
  });

  it("returns valid=false with patchedFinding when LLM proposes correction", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "test", model: "claude-x" });
    (adapter as unknown as { client: { messages: { create: unknown } } }).client = {
      messages: {
        create: async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [
            {
              type: "tool_use",
              name: "verify_finding",
              input: {
                valid: false,
                reason: "wrong line",
                confidenceScore: 0.7,
                patchedFinding: fixed,
              },
            },
          ],
        }),
      },
    };
    const r = await adapter.verifyFinding(sample, ctx);
    assert.equal(r.valid, false);
    assert.ok(r.patchedFinding);
    assert.equal(r.patchedFinding!.startLine, 5);
  });

  it("throws when no tool_use block returned", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "test", model: "claude-x" });
    (adapter as unknown as { client: { messages: { create: unknown } } }).client = {
      messages: {
        create: async () => ({
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: "text", text: "no tool used" }],
        }),
      },
    };
    await assert.rejects(adapter.verifyFinding(sample, ctx), /tool_use/);
  });
});

describe("OpenAICompatibleAdapter.verifyFinding", () => {
  it("parses tool_calls.function.arguments JSON into CritiqueResult", async () => {
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "test",
      model: "gpt-x",
      provider: "openai",
    });
    (adapter as unknown as { client: { chat: { completions: { create: unknown } } } }).client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: "verify_finding",
                        arguments: JSON.stringify({
                          valid: false,
                          reason: "x",
                          confidenceScore: 0.6,
                          patchedFinding: fixed,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        },
      },
    };
    const r = await adapter.verifyFinding(sample, ctx);
    assert.equal(r.valid, false);
    assert.equal(r.patchedFinding!.title_en, "FIXED");
  });
});

describe("AnthropicAdapter.regenerateFinding", () => {
  it("returns the corrected finding from tool input", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "test", model: "claude-x" });
    (adapter as unknown as { client: { messages: { create: unknown } } }).client = {
      messages: {
        create: async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [
            {
              type: "tool_use",
              name: "report_finding",
              input: { finding: fixed },
            },
          ],
        }),
      },
    };
    const r = await adapter.regenerateFinding(
      sample,
      { valid: false, reason: "wrong", confidenceScore: 0.5 },
      ctx
    );
    assert.equal(r.startLine, 5);
    assert.equal(r.title_en, "FIXED");
  });

  it("throws when regenerated finding is missing required fields", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "test", model: "claude-x" });
    (adapter as unknown as { client: { messages: { create: unknown } } }).client = {
      messages: {
        create: async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [
            {
              type: "tool_use",
              name: "report_finding",
              // missing aiPrompt, summary_zh
              input: {
                finding: { ...fixed, aiPrompt: undefined, summary_zh: null },
              },
            },
          ],
        }),
      },
    };
    await assert.rejects(
      adapter.regenerateFinding(
        sample,
        { valid: false, reason: "x", confidenceScore: 0.5 },
        ctx
      ),
      /missing field/
    );
  });
});

describe("OpenAICompatibleAdapter.regenerateFinding", () => {
  it("parses tool_calls JSON into ReviewFinding", async () => {
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "test",
      model: "gpt-x",
      provider: "openai",
    });
    (adapter as unknown as { client: { chat: { completions: { create: unknown } } } }).client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: "report_finding",
                        arguments: JSON.stringify({ finding: fixed }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        },
      },
    };
    const r = await adapter.regenerateFinding(
      sample,
      { valid: false, reason: "x", confidenceScore: 0.5 },
      ctx
    );
    assert.equal(r.title_en, "FIXED");
  });
});
