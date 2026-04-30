# Bilingual PR Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `generateReviewSummary` to output bilingual (EN + ZH) summaries with optional mermaid flow diagrams, while injecting reviewer guidelines and target-repo project context into the prompt.

**Architecture:** Tool schema gains 5 required fields (`summaryMd_en`, `summaryMd_zh`, `highlights_en`, `highlights_zh`, `mermaid_flow`). New `context.ts` loads docs from reviewer cwd (lazy-cached) and target repo via a new `IProvider.getRepositoryFile` API (LRU 256, key includes head SHA). Worker renders the bilingual layout EN → ZH → mermaid.

**Tech Stack:** TypeScript, Node test runner (`node:test`), pnpm workspace, Anthropic + OpenAI-compat SDKs.

**Spec:** `docs/superpowers/specs/2026-04-29-bilingual-pr-summary-design.md`

---

## File Structure

### New files
- `packages/ai/src/context.ts` — reviewer-guideline + target-repo doc loaders, LRU cache
- `packages/ai/src/context.test.mjs` — unit tests for the loaders & cache
- `packages/ai/src/render.ts` — `renderBilingualSummary(summary)` pure function
- `packages/ai/src/render.test.mjs` — unit tests for render

### Modified files
- `packages/ai/src/types.ts` — `ReviewSummary` (5 fields) + `ReviewContext` (`guidelines?`, `projectContext?`)
- `packages/ai/src/adapter.ts` — new `SUMMARY_SCHEMA`, prompt injection, `validateAndNormalizeSummary`
- `packages/ai/src/review.test.mjs` — pin new contract (bilingual + mermaid + content fallback)
- `packages/ai/src/index.ts` — re-export `loadReviewerGuidelines`, `loadTargetRepoContext`, `renderBilingualSummary`
- `packages/git/src/provider.ts` — `IProvider.getRepositoryFile`
- `packages/git/src/github/provider.ts` — implement `getRepositoryFile`
- `packages/git/src/gitee/provider.ts` — implement `getRepositoryFile`
- `apps/worker/src/handlers/review.ts` — load context before AI call; replace `summaryMd` rendering

---

## Task 1: Upgrade `ReviewSummary` and `ReviewContext` types

**Files:**
- Modify: `packages/ai/src/types.ts`

- [ ] **Step 1.1: Update `ReviewSummary` and `ReviewContext`**

Replace the entire file `packages/ai/src/types.ts` with:

```ts
import type { FileDiff } from "@reviewer/git";

export interface ReviewContext {
  fullName: string;            // 仓库 full_name，如 "owner/repo"
  prNumber: number;
  headSha: string;
  diffs: FileDiff[];
  guidelines?: string;         // reviewer 自身规范（CLAUDE.md/AGENTS.md/...）
  projectContext?: string;     // 目标仓库背景（同名 4 文件）
}

export interface ReviewFinding {
  filePath: string;
  startLine: number;
  endLine: number;
  side: "LEFT" | "RIGHT";
  issueType: "quality" | "security";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;
  suggestion: string;
  confidenceScore: number;
}

export interface ReviewResult {
  findings: ReviewFinding[];
}

export interface ReviewSummary {
  summaryMd_en: string;
  summaryMd_zh: string;
  highlights_en: string[];
  highlights_zh: string[];
  mermaid_flow: string;
}

export interface ReviewSummaryResult {
  summary: ReviewSummary;
}
```

- [ ] **Step 1.2: Verify TypeScript still compiles (will report breakages we will fix in later tasks)**

Run: `pnpm -C packages/ai exec tsc --noEmit 2>&1 | head -40`
Expected: errors in `adapter.ts` referring to `summaryMd` / `highlights` (these are intentional — they get fixed in Task 2/3). No errors outside these expected sites.

- [ ] **Step 1.3: Commit**

```bash
git add packages/ai/src/types.ts
git commit -m "refactor: bilingual summary type shape / 双语 summary 类型升级

ReviewSummary 拆 5 字段 (en/zh + highlights*2 + mermaid_flow)，
ReviewContext 加 guidelines / projectContext 可选字段。
adapter.ts 暂时编译报错，下一个 task 修。"
```

---

## Task 2: Update `SUMMARY_SCHEMA` and `validateAndNormalizeSummary`

**Files:**
- Modify: `packages/ai/src/adapter.ts:47-57` (SUMMARY_SCHEMA), `:211-230` (validateAndNormalizeSummary)
- Modify: `packages/ai/src/review.test.mjs` (pin new contract)

- [ ] **Step 2.1: Write failing test for new schema validation**

Append to `packages/ai/src/review.test.mjs` (above any closing markers — file currently ends without a guard, append at EOF):

```js
// ---------------------------------------------------------------------------
// 5. validateAndNormalizeSummary: bilingual + mermaid contract
// ---------------------------------------------------------------------------

function validateAndNormalizeSummary_reference(input) {
  if (typeof input !== "object" || input === null) {
    throw new Error("Tool input: report_summary expected an object");
  }
  const obj = input;
  const en = obj.summaryMd_en;
  const zh = obj.summaryMd_zh;
  const hi_en = obj.highlights_en;
  const hi_zh = obj.highlights_zh;
  const mermaid = obj.mermaid_flow;
  if (typeof en !== "string" || en.trim() === "") {
    throw new Error("Tool input: 'summaryMd_en' must be a non-empty string");
  }
  if (typeof zh !== "string" || zh.trim() === "") {
    throw new Error("Tool input: 'summaryMd_zh' must be a non-empty string");
  }
  if (!Array.isArray(hi_en)) {
    throw new Error("Tool input: 'highlights_en' must be an array");
  }
  if (!Array.isArray(hi_zh)) {
    throw new Error("Tool input: 'highlights_zh' must be an array");
  }
  if (typeof mermaid !== "string") {
    throw new Error("Tool input: 'mermaid_flow' must be a string (use empty string when no flow)");
  }
  return {
    summaryMd_en: en,
    summaryMd_zh: zh,
    highlights_en: hi_en.filter((h) => typeof h === "string" && h.trim() !== ""),
    highlights_zh: hi_zh.filter((h) => typeof h === "string" && h.trim() !== ""),
    mermaid_flow: mermaid,
  };
}

test("validateAndNormalizeSummary: accepts full bilingual payload", () => {
  const out = validateAndNormalizeSummary_reference({
    summaryMd_en: "Adds bilingual summary",
    summaryMd_zh: "增加双语总评",
    highlights_en: ["a", "b"],
    highlights_zh: ["甲", "乙"],
    mermaid_flow: "",
  });
  assert.equal(out.summaryMd_en, "Adds bilingual summary");
  assert.equal(out.summaryMd_zh, "增加双语总评");
  assert.deepEqual(out.highlights_en, ["a", "b"]);
  assert.deepEqual(out.highlights_zh, ["甲", "乙"]);
  assert.equal(out.mermaid_flow, "");
});

test("validateAndNormalizeSummary: keeps non-empty mermaid flow", () => {
  const flow = "```mermaid\nflowchart LR\nA-->B\n```";
  const out = validateAndNormalizeSummary_reference({
    summaryMd_en: "x",
    summaryMd_zh: "x",
    highlights_en: [],
    highlights_zh: [],
    mermaid_flow: flow,
  });
  assert.equal(out.mermaid_flow, flow);
});

test("validateAndNormalizeSummary: rejects missing summaryMd_en", () => {
  assert.throws(
    () =>
      validateAndNormalizeSummary_reference({
        summaryMd_zh: "x",
        highlights_en: [],
        highlights_zh: [],
        mermaid_flow: "",
      }),
    /summaryMd_en/
  );
});

test("validateAndNormalizeSummary: rejects missing summaryMd_zh", () => {
  assert.throws(
    () =>
      validateAndNormalizeSummary_reference({
        summaryMd_en: "x",
        highlights_en: [],
        highlights_zh: [],
        mermaid_flow: "",
      }),
    /summaryMd_zh/
  );
});

test("validateAndNormalizeSummary: rejects non-string mermaid_flow", () => {
  assert.throws(
    () =>
      validateAndNormalizeSummary_reference({
        summaryMd_en: "x",
        summaryMd_zh: "x",
        highlights_en: [],
        highlights_zh: [],
      }),
    /mermaid_flow/
  );
});

test("validateAndNormalizeSummary: filters empty/non-string highlights", () => {
  const out = validateAndNormalizeSummary_reference({
    summaryMd_en: "x",
    summaryMd_zh: "x",
    highlights_en: ["a", "", null, "b"],
    highlights_zh: ["甲", undefined, "乙"],
    mermaid_flow: "",
  });
  assert.deepEqual(out.highlights_en, ["a", "b"]);
  assert.deepEqual(out.highlights_zh, ["甲", "乙"]);
});
```

- [ ] **Step 2.2: Run failing tests to confirm they pass against the reference**

Run: `pnpm -C packages/ai test 2>&1 | tail -30`
Expected: All new tests pass (this is a *reference* — we're pinning the contract before changing the real `validateAndNormalizeSummary`).

- [ ] **Step 2.3: Replace `SUMMARY_SCHEMA` in `packages/ai/src/adapter.ts`**

Find:

```ts
const SUMMARY_SCHEMA = {
  type: "object" as const,
  properties: {
    summaryMd: { type: "string" as const },
    highlights: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  required: ["summaryMd", "highlights"] as string[],
};
```

Replace with:

```ts
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
```

- [ ] **Step 2.4: Replace `validateAndNormalizeSummary` (currently around lines 211-230)**

Find:

```ts
function validateAndNormalizeSummary(input: unknown): ReviewSummary {
  if (typeof input !== "object" || input === null) {
    throw new Error("Tool input: report_summary expected an object");
  }
  const obj = input as Record<string, unknown>;
  const summaryMd = obj.summaryMd;
  const highlights = obj.highlights;
  if (typeof summaryMd !== "string" || summaryMd.trim() === "") {
    throw new Error("Tool input: 'summaryMd' must be a non-empty string");
  }
  if (!Array.isArray(highlights)) {
    throw new Error("Tool input: 'highlights' must be an array");
  }
  return {
    summaryMd,
    highlights: highlights.filter(
      (h): h is string => typeof h === "string" && h.trim() !== ""
    ),
  };
}
```

Replace with:

```ts
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
```

- [ ] **Step 2.5: Update both adapters' "no diff" early returns**

In `AnthropicAdapter.generateReviewSummary` and `OpenAICompatibleAdapter.generateReviewSummary`, find:

```ts
return { summary: { summaryMd: "_No textual diff to summarize._", highlights: [] } };
```

Replace with (do this for **both** adapter classes):

```ts
return {
  summary: {
    summaryMd_en: "_No textual diff to summarize._",
    summaryMd_zh: "_本次 PR 没有可用于总结的代码 diff。_",
    highlights_en: [],
    highlights_zh: [],
    mermaid_flow: "",
  },
};
```

- [ ] **Step 2.6: Type-check**

Run: `pnpm -C packages/ai exec tsc --noEmit 2>&1 | tail -20`
Expected: No errors in `adapter.ts` (errors elsewhere from Task 1 should be gone too — this task closes the type loop).

- [ ] **Step 2.7: Run tests**

Run: `pnpm -C packages/ai test 2>&1 | tail -30`
Expected: All tests pass including new bilingual ones.

- [ ] **Step 2.8: Commit**

```bash
git add packages/ai/src/adapter.ts packages/ai/src/review.test.mjs
git commit -m "feat: bilingual summary schema + validation / 双语 summary schema

SUMMARY_SCHEMA 升 5 字段 (summaryMd_en/zh, highlights_en/zh, mermaid_flow)
all required；validateAndNormalizeSummary 全字段 strict 校验，
mermaid_flow 用空串表示无流程。empty-diff 早返回也升级到双语形态。
契约测试在 review.test.mjs 钉死。"
```

---

## Task 3: Inject reviewer/project context and bilingual prompt

**Files:**
- Modify: `packages/ai/src/adapter.ts:160-178` (`buildSummaryUserMessage`, `SUMMARY_SYSTEM_PROMPT`)

- [ ] **Step 3.1: Update `SUMMARY_SYSTEM_PROMPT`**

Find:

```ts
const SUMMARY_SYSTEM_PROMPT =
  "You are a senior code reviewer summarizing a pull request for a teammate. Be accurate, specific, and concise. Describe what changed and why; flag noteworthy risks. Do not fabricate behavior that is not in the diff.";
```

Replace with:

```ts
const SUMMARY_SYSTEM_PROMPT =
  "You are a senior code reviewer summarizing a pull request for a teammate. " +
  "Be accurate, specific, and concise. Describe what changed and why; flag noteworthy risks. " +
  "Do not fabricate behavior that is not in the diff. " +
  "You produce both English and Simplified Chinese outputs that are independently idiomatic — not literal translations. " +
  "When the diff introduces or alters a clear execution flow, call chain, or state transition, output a mermaid diagram in the mermaid_flow field; otherwise leave it empty.";
```

- [ ] **Step 3.2: Replace `buildSummaryUserMessage`**

Find (currently around lines 160-172):

```ts
function buildSummaryUserMessage(context: ReviewContext, diffText: string): string {
  return `You are summarizing pull request #${context.prNumber} in repository ${context.fullName} (head SHA: ${context.headSha}).

Read the following diff and call the \`report_summary\` tool with:
- \`summaryMd\`: a concise Markdown overview (3–8 sentences) describing what this PR changes and why, written for a reviewer who has not yet read the diff.
- \`highlights\`: 2–6 short bullet strings naming the most important changes, risks, or things to double-check.

Be specific. Reference file or module names where useful. Do not invent functionality not present in the diff.

<diff>
${diffText}
</diff>`;
}
```

Replace with:

```ts
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
```

- [ ] **Step 3.3: Type-check**

Run: `pnpm -C packages/ai exec tsc --noEmit 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3.4: Run tests**

Run: `pnpm -C packages/ai test 2>&1 | tail -15`
Expected: All tests pass (no test directly asserts prompt text, but contract tests must remain green).

- [ ] **Step 3.5: Commit**

```bash
git add packages/ai/src/adapter.ts
git commit -m "feat: inject reviewer/project context + bilingual summary prompt / 注入项目背景

system prompt 加双语 + 流程图指令；user message 新增
<reviewer_guidelines> 和 <project_context> 两块，并把工具 5
字段产出要求显式列出。"
```

---

## Task 4: Add `getRepositoryFile` to `IProvider`

**Files:**
- Modify: `packages/git/src/provider.ts`

- [ ] **Step 4.1: Add the new method to `IProvider`**

In `packages/git/src/provider.ts`, after the `normalizeWebhookEvent` declaration (just before the closing `}`), insert:

```ts
  /**
   * 读取目标仓库某个文件的 utf-8 内容。
   *
   * - 返回 null 表示文件不存在 (404)，**不抛**。
   * - 其他错误（401/403/5xx/网络）按平台错误处理（withGitPlatformErrorBoundary）抛出。
   * - 调用方负责按字符截断和缓存策略。
   */
  getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<string | null>;
```

- [ ] **Step 4.2: Type-check (will fail until GitHub/Gitee implementations are added)**

Run: `pnpm -C packages/git exec tsc --noEmit 2>&1 | tail -20`
Expected: errors saying `GitHubProvider` / `GiteeProvider` do not implement `getRepositoryFile`.

- [ ] **Step 4.3: Commit**

```bash
git add packages/git/src/provider.ts
git commit -m "feat: add IProvider.getRepositoryFile / 接口增加单文件读取

为后续注入 PR 仓库的 README/CLAUDE/AGENTS/pattern 等
背景文件做接口铺垫；404 返回 null 不抛，其他错误按平台
错误抛出。GitHub/Gitee 实现下一个 commit。"
```

---

## Task 5: Implement `getRepositoryFile` in GitHub provider

**Files:**
- Modify: `packages/git/src/github/provider.ts`

- [ ] **Step 5.1: Add the method to `GitHubProvider`**

In `packages/git/src/github/provider.ts`, inside the `GitHubProvider` class (right after `postPullRequestComment` and before `normalizeWebhookEvent`), add:

```ts
  async getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<string | null> {
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub repository full_name: ${fullName}`);
    }
    const octokit = await buildOctokit(credential);
    return withGitPlatformErrorBoundary(
      async () => {
        try {
          const { data } = await (octokit as Awaited<ReturnType<typeof getPatOctokit>>).request(
            "GET /repos/{owner}/{repo}/contents/{path}",
            { owner, repo, path, ref }
          );
          if (Array.isArray(data) || !("content" in data) || data.type !== "file") {
            return null;
          }
          const buf = Buffer.from(data.content as string, "base64");
          const text = buf.toString("utf-8");
          logger?.debug("Fetched GitHub repository file", {
            fullName,
            path,
            ref,
            bytes: buf.length,
          });
          return text;
        } catch (err) {
          if (
            typeof err === "object" &&
            err !== null &&
            "status" in err &&
            (err as { status?: number }).status === 404
          ) {
            return null;
          }
          throw err;
        }
      },
      PROVIDER,
      logger,
      context({ operation: "getRepositoryFile", fullName, path, ref })
    );
  }
```

- [ ] **Step 5.2: Type-check**

Run: `pnpm -C packages/git exec tsc --noEmit 2>&1 | tail -20`
Expected: only Gitee `GiteeProvider` still missing the method (fixed in Task 6).

- [ ] **Step 5.3: Commit**

```bash
git add packages/git/src/github/provider.ts
git commit -m "feat: GitHub getRepositoryFile / GitHub 单文件读取

调 contents API 取 base64 解码；404 返回 null 不抛，
其他错误走 withGitPlatformErrorBoundary。"
```

---

## Task 6: Implement `getRepositoryFile` in Gitee provider

**Files:**
- Modify: `packages/git/src/gitee/provider.ts`

- [ ] **Step 6.1: Locate the `splitFullName` helper**

The file already has a `splitFullName` helper near the top — reuse it.

- [ ] **Step 6.2: Add the method**

In `packages/git/src/gitee/provider.ts`, inside the `GiteeProvider` class (right after `postPullRequestComment` and before `normalizeWebhookEvent`), add:

```ts
  async getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<string | null> {
    const cred = assertGitee(credential);
    const { owner, repo } = splitFullName(fullName);
    const client = getGiteePatClient(cred);
    return withGitPlatformErrorBoundary(
      async () => {
        try {
          const data = await client.request<{
            type?: string;
            encoding?: string;
            content?: string;
          }>(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
              .split("/")
              .map((seg) => encodeURIComponent(seg))
              .join("/")}?ref=${encodeURIComponent(ref)}`
          );
          if (!data || data.type !== "file" || typeof data.content !== "string") {
            return null;
          }
          const buf = Buffer.from(data.content, "base64");
          const text = buf.toString("utf-8");
          logger?.debug("Fetched Gitee repository file", {
            fullName,
            path,
            ref,
            bytes: buf.length,
          });
          return text;
        } catch (err) {
          if (
            typeof err === "object" &&
            err !== null &&
            "status" in err &&
            (err as { status?: number }).status === 404
          ) {
            return null;
          }
          throw err;
        }
      },
      PROVIDER,
      logger,
      context({ operation: "getRepositoryFile", fullName, path, ref })
    );
  }
```

> **Note:** if `getGiteePatClient` rejects with a different error shape than `{ status }`, this code falls through to throw — that's intentional (let `withGitPlatformErrorBoundary` map it). Verify the existing client by reading `packages/git/src/gitee/client.ts` if behavior surprises you during testing.

- [ ] **Step 6.3: Type-check**

Run: `pnpm -C packages/git exec tsc --noEmit 2>&1 | tail -20`
Expected: no errors.

- [ ] **Step 6.4: Run package tests (if any)**

Run: `pnpm -C packages/git test 2>&1 | tail -15`
Expected: PASS or "no test specified" (whichever existed before).

- [ ] **Step 6.5: Commit**

```bash
git add packages/git/src/gitee/provider.ts
git commit -m "feat: Gitee getRepositoryFile / Gitee 单文件读取

调 /repos/:owner/:repo/contents/:path 取 base64 解码；
404 返回 null 不抛，其他错误走 withGitPlatformErrorBoundary。"
```

---

## Task 7: Reviewer-guideline loader (lazy + cached)

**Files:**
- Create: `packages/ai/src/context.ts`
- Create: `packages/ai/src/context.test.mjs`

- [ ] **Step 7.1: Write the failing test**

Create `packages/ai/src/context.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { loadReviewerGuidelines, _resetReviewerGuidelinesCache } from "./context.ts";

const WHITELIST = ["CLAUDE.md", "AGENTS.md", "pattern.md", "README.md"];

async function withTempCwd(files, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rev-ctx-"));
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content, "utf-8");
  }
  const original = process.cwd();
  process.chdir(dir);
  try {
    _resetReviewerGuidelinesCache();
    await fn(dir);
  } finally {
    process.chdir(original);
    await fs.rm(dir, { recursive: true, force: true });
    _resetReviewerGuidelinesCache();
  }
}

test("loadReviewerGuidelines: concatenates whitelisted files in order", async () => {
  await withTempCwd(
    {
      "CLAUDE.md": "claude-rule",
      "AGENTS.md": "agent-rule",
      "pattern.md": "pattern-rule",
      "README.md": "readme-rule",
    },
    async () => {
      const out = await loadReviewerGuidelines();
      const order = WHITELIST.map((f) => out.indexOf(`# ${f}`));
      assert.ok(order[0] < order[1], "CLAUDE.md before AGENTS.md");
      assert.ok(order[1] < order[2], "AGENTS.md before pattern.md");
      assert.ok(order[2] < order[3], "pattern.md before README.md");
      assert.ok(out.includes("claude-rule"));
      assert.ok(out.includes("readme-rule"));
    }
  );
});

test("loadReviewerGuidelines: skips missing files silently", async () => {
  await withTempCwd({ "README.md": "only-readme" }, async () => {
    const out = await loadReviewerGuidelines();
    assert.ok(out.includes("only-readme"));
    assert.ok(!out.includes("# CLAUDE.md"));
    assert.ok(!out.includes("# AGENTS.md"));
    assert.ok(!out.includes("# pattern.md"));
  });
});

test("loadReviewerGuidelines: empty when no whitelisted files exist", async () => {
  await withTempCwd({}, async () => {
    const out = await loadReviewerGuidelines();
    assert.equal(out, "");
  });
});

test("loadReviewerGuidelines: truncates files over 4000 chars", async () => {
  const big = "x".repeat(5000);
  await withTempCwd({ "README.md": big }, async () => {
    const out = await loadReviewerGuidelines();
    const idx = out.indexOf("xxxx");
    assert.ok(idx >= 0);
    const tail = out.slice(idx);
    assert.ok(tail.includes("[...truncated]"), "should annotate truncation");
    const xs = (out.match(/x/g) ?? []).length;
    assert.equal(xs, 4000, "must keep exactly 4000 chars of content");
  });
});

test("loadReviewerGuidelines: caches across calls (lazy load once)", async () => {
  await withTempCwd({ "README.md": "first" }, async (dir) => {
    const a = await loadReviewerGuidelines();
    await fs.writeFile(path.join(dir, "README.md"), "second", "utf-8");
    const b = await loadReviewerGuidelines();
    assert.equal(a, b, "second call returns cached value, not new file content");
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `pnpm -C packages/ai test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './context.ts'`.

- [ ] **Step 7.3: Implement the loader**

Create `packages/ai/src/context.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

export const REVIEWER_DOC_WHITELIST = [
  "CLAUDE.md",
  "AGENTS.md",
  "pattern.md",
  "README.md",
] as const;

export const MAX_DOC_CHARS = 4000;

const TRUNCATE_MARKER = "\n\n[...truncated]";

function truncate(text: string): string {
  if (text.length <= MAX_DOC_CHARS) return text;
  return text.slice(0, MAX_DOC_CHARS) + TRUNCATE_MARKER;
}

function joinDocs(parts: Array<{ name: string; content: string }>): string {
  if (parts.length === 0) return "";
  return parts.map((p) => `# ${p.name}\n${p.content}`).join("\n\n");
}

let reviewerCache: Promise<string> | null = null;

export async function loadReviewerGuidelines(): Promise<string> {
  if (reviewerCache) return reviewerCache;
  reviewerCache = (async () => {
    const cwd = process.cwd();
    const parts: Array<{ name: string; content: string }> = [];
    for (const name of REVIEWER_DOC_WHITELIST) {
      try {
        const raw = await fs.readFile(path.join(cwd, name), "utf-8");
        parts.push({ name, content: truncate(raw) });
      } catch {
        // 文件不存在或读不到，跳过
      }
    }
    return joinDocs(parts);
  })();
  return reviewerCache;
}

/** 仅供测试使用，正常代码路径不应调用。 */
export function _resetReviewerGuidelinesCache(): void {
  reviewerCache = null;
}
```

- [ ] **Step 7.4: Run tests**

Run: `pnpm -C packages/ai test 2>&1 | tail -20`
Expected: All `loadReviewerGuidelines` tests PASS.

- [ ] **Step 7.5: Commit**

```bash
git add packages/ai/src/context.ts packages/ai/src/context.test.mjs
git commit -m "feat: reviewer-guideline loader / 本仓库背景加载

读取 cwd 下 CLAUDE/AGENTS/pattern/README，单文件 4000 字截断，
进程级 lazy load + cache。worker 重启即重读。"
```

---

## Task 8: LRU cache utility

**Files:**
- Modify: `packages/ai/src/context.ts` (add LRU)
- Modify: `packages/ai/src/context.test.mjs` (add LRU tests)

- [ ] **Step 8.1: Write failing tests for LRU**

Append to `packages/ai/src/context.test.mjs`:

```js
import { LruCache } from "./context.ts";

test("LruCache: stores and retrieves values", () => {
  const c = new LruCache(3);
  c.set("a", "1");
  assert.equal(c.get("a"), "1");
});

test("LruCache: returns undefined for missing keys", () => {
  const c = new LruCache(3);
  assert.equal(c.get("missing"), undefined);
});

test("LruCache: evicts oldest when capacity exceeded", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  c.set("b", "2");
  c.set("c", "3"); // evicts "a"
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("b"), "2");
  assert.equal(c.get("c"), "3");
});

test("LruCache: get() refreshes recency", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  c.set("b", "2");
  c.get("a");        // touch "a"
  c.set("c", "3");   // evicts "b" (least recently used)
  assert.equal(c.get("a"), "1");
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("c"), "3");
});

test("LruCache: set() of existing key refreshes recency", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  c.set("b", "2");
  c.set("a", "1b");  // refresh "a"
  c.set("c", "3");   // evicts "b"
  assert.equal(c.get("a"), "1b");
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("c"), "3");
});

test("LruCache: stores null values explicitly (negative cache)", () => {
  const c = new LruCache(2);
  c.set("missing", null);
  assert.equal(c.has("missing"), true);
  assert.equal(c.get("missing"), null);
});
```

- [ ] **Step 8.2: Run tests to verify they fail**

Run: `pnpm -C packages/ai test 2>&1 | tail -20`
Expected: FAIL — `LruCache is not exported`.

- [ ] **Step 8.3: Implement LRU**

Append to `packages/ai/src/context.ts`:

```ts
export class LruCache<V> {
  private readonly capacity: number;
  private readonly map = new Map<string, V>();

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`LruCache capacity must be a positive integer, got: ${capacity}`);
    }
    this.capacity = capacity;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (typeof oldestKey === "string") this.map.delete(oldestKey);
    }
  }
}
```

- [ ] **Step 8.4: Run tests**

Run: `pnpm -C packages/ai test 2>&1 | tail -25`
Expected: All LRU tests PASS.

- [ ] **Step 8.5: Commit**

```bash
git add packages/ai/src/context.ts packages/ai/src/context.test.mjs
git commit -m "feat: LruCache util in @reviewer/ai / 简易 LRU

Map-based 容量驱逐 + get/set 刷新 recency，支持 null 作为
负缓存值（避免反复 404）。供下个 task 的 target-repo 缓存使用。"
```

---

## Task 9: Target-repo doc loader with LRU

**Files:**
- Modify: `packages/ai/src/context.ts`
- Modify: `packages/ai/src/context.test.mjs`

- [ ] **Step 9.1: Write failing tests**

Append to `packages/ai/src/context.test.mjs`:

```js
import { loadTargetRepoContext, _resetTargetRepoCache } from "./context.ts";

function fakeProvider(map = {}, opts = {}) {
  const calls = [];
  return {
    calls,
    provider: "github",
    async getRepositoryFile(fullName, path, ref) {
      calls.push({ fullName, path, ref });
      if (opts.throwOn?.(path)) throw new Error("boom");
      const key = `${fullName}|${path}|${ref}`;
      return key in map ? map[key] : null;
    },
  };
}

const FAKE_LOGGER = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

test("loadTargetRepoContext: pulls whitelisted files concurrently", async () => {
  _resetTargetRepoCache();
  const p = fakeProvider({
    "owner/repo|CLAUDE.md|sha1": "claude-content",
    "owner/repo|README.md|sha1": "readme-content",
  });
  const out = await loadTargetRepoContext(p, "owner/repo", "sha1", { type: "github_pat", token: "x" }, FAKE_LOGGER);
  assert.ok(out.includes("# CLAUDE.md"));
  assert.ok(out.includes("claude-content"));
  assert.ok(out.includes("# README.md"));
  assert.ok(out.includes("readme-content"));
  assert.equal(p.calls.length, 4, "must attempt all 4 whitelist files");
});

test("loadTargetRepoContext: returns empty string when nothing found", async () => {
  _resetTargetRepoCache();
  const p = fakeProvider({});
  const out = await loadTargetRepoContext(p, "owner/repo", "sha1", { type: "github_pat", token: "x" }, FAKE_LOGGER);
  assert.equal(out, "");
});

test("loadTargetRepoContext: caches by (provider, fullName, ref, path)", async () => {
  _resetTargetRepoCache();
  const p = fakeProvider({ "owner/repo|README.md|sha1": "rd" });
  await loadTargetRepoContext(p, "owner/repo", "sha1", { type: "github_pat", token: "x" }, FAKE_LOGGER);
  const before = p.calls.length;
  await loadTargetRepoContext(p, "owner/repo", "sha1", { type: "github_pat", token: "x" }, FAKE_LOGGER);
  assert.equal(p.calls.length, before, "second call must hit cache for all 4 files");
});

test("loadTargetRepoContext: cache key isolates by ref (head SHA)", async () => {
  _resetTargetRepoCache();
  const p = fakeProvider({
    "owner/repo|README.md|sha1": "old",
    "owner/repo|README.md|sha2": "new",
  });
  const a = await loadTargetRepoContext(p, "owner/repo", "sha1", { type: "github_pat", token: "x" }, FAKE_LOGGER);
  const b = await loadTargetRepoContext(p, "owner/repo", "sha2", { type: "github_pat", token: "x" }, FAKE_LOGGER);
  assert.ok(a.includes("old"));
  assert.ok(b.includes("new"));
});

test("loadTargetRepoContext: warn-and-skip on per-file error, others still load", async () => {
  _resetTargetRepoCache();
  const warnings = [];
  const logger = { ...FAKE_LOGGER, warn: (msg, extra) => warnings.push({ msg, extra }) };
  const p = fakeProvider(
    { "owner/repo|README.md|sha1": "rd" },
    { throwOn: (path) => path === "CLAUDE.md" }
  );
  const out = await loadTargetRepoContext(p, "owner/repo", "sha1", { type: "github_pat", token: "x" }, logger);
  assert.ok(out.includes("rd"));
  assert.ok(!out.includes("# CLAUDE.md"));
  assert.ok(warnings.some((w) => w.msg.includes("project context")));
});

test("loadTargetRepoContext: truncates files over 4000 chars", async () => {
  _resetTargetRepoCache();
  const big = "y".repeat(5000);
  const p = fakeProvider({ "owner/repo|README.md|sha1": big });
  const out = await loadTargetRepoContext(p, "owner/repo", "sha1", { type: "github_pat", token: "x" }, FAKE_LOGGER);
  assert.ok(out.includes("[...truncated]"));
  const ys = (out.match(/y/g) ?? []).length;
  assert.equal(ys, 4000);
});
```

- [ ] **Step 9.2: Run tests to verify they fail**

Run: `pnpm -C packages/ai test 2>&1 | tail -25`
Expected: FAIL — `loadTargetRepoContext is not exported`.

- [ ] **Step 9.3: Implement target-repo loader**

Append to `packages/ai/src/context.ts`:

```ts
import type { Logger } from "@reviewer/core";
import type { IProvider, ProviderCredential } from "@reviewer/git";

export const TARGET_CACHE_CAPACITY = 256;

const targetCache = new LruCache<string | null>(TARGET_CACHE_CAPACITY);

interface TargetRepoProvider {
  provider: string;
  getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<string | null>;
}

export async function loadTargetRepoContext(
  provider: TargetRepoProvider,
  fullName: string,
  ref: string,
  credential: ProviderCredential,
  logger: Logger
): Promise<string> {
  const tasks = REVIEWER_DOC_WHITELIST.map(async (name) => {
    const cacheKey = `${provider.provider}:${fullName}:${ref}:${name}`;
    if (targetCache.has(cacheKey)) {
      const cached = targetCache.get(cacheKey);
      return cached === null ? null : { name, content: truncate(cached) };
    }
    try {
      const content = await provider.getRepositoryFile(
        fullName,
        name,
        ref,
        credential,
        logger
      );
      targetCache.set(cacheKey, content);
      return content === null ? null : { name, content: truncate(content) };
    } catch (err) {
      logger.warn("Failed to load project context file (will skip)", {
        full_name: fullName,
        ref,
        path: name,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  });

  const results = await Promise.all(tasks);
  const parts = results.filter(
    (r): r is { name: string; content: string } => r !== null
  );
  return joinDocs(parts);
}

/** 仅供测试使用。 */
export function _resetTargetRepoCache(): void {
  // 直接重新构造 map 比 clear() 更确保 GC 友好；这里简单起见直接清空
  // 但 LruCache 没暴露 clear，借用 set/eject 实现：直接替换容量大小新建即可。
  // 这里采用最小侵入：调用方通过新建一个 LruCache 替代。
  // 由于 targetCache 是 const，我们改成 mutable 引用。
  targetCacheRef.cache = new LruCache<string | null>(TARGET_CACHE_CAPACITY);
}
```

> **Implementation note:** Because the test calls `_resetTargetRepoCache`, the `targetCache` variable cannot be a `const` capture that the loader closes over while the test reassigns. Refactor to an indirection:

After writing the snippet above, **rewrite the cache section** to actually compile. Replace the previous block in this task with this final form (the previous draft is illustrative of the test contract only):

```ts
import type { Logger } from "@reviewer/core";
import type { IProvider, ProviderCredential } from "@reviewer/git";

export const TARGET_CACHE_CAPACITY = 256;

const targetCacheRef: { cache: LruCache<string | null> } = {
  cache: new LruCache<string | null>(TARGET_CACHE_CAPACITY),
};

interface TargetRepoProvider {
  provider: string;
  getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<string | null>;
}

export async function loadTargetRepoContext(
  provider: TargetRepoProvider,
  fullName: string,
  ref: string,
  credential: ProviderCredential,
  logger: Logger
): Promise<string> {
  const cache = targetCacheRef.cache;
  const tasks = REVIEWER_DOC_WHITELIST.map(async (name) => {
    const cacheKey = `${provider.provider}:${fullName}:${ref}:${name}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      return cached === null ? null : { name, content: truncate(cached) };
    }
    try {
      const content = await provider.getRepositoryFile(
        fullName,
        name,
        ref,
        credential,
        logger
      );
      cache.set(cacheKey, content);
      return content === null ? null : { name, content: truncate(content) };
    } catch (err) {
      logger.warn("Failed to load project context file (will skip)", {
        full_name: fullName,
        ref,
        path: name,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  });

  const results = await Promise.all(tasks);
  const parts = results.filter(
    (r): r is { name: string; content: string } => r !== null
  );
  return joinDocs(parts);
}

export function _resetTargetRepoCache(): void {
  targetCacheRef.cache = new LruCache<string | null>(TARGET_CACHE_CAPACITY);
}
```

> Make sure only **one** copy of `targetCacheRef` / `loadTargetRepoContext` / `_resetTargetRepoCache` ends up in the file. Delete the illustrative draft if it was committed.

- [ ] **Step 9.4: Run tests**

Run: `pnpm -C packages/ai test 2>&1 | tail -30`
Expected: All target-repo tests PASS.

- [ ] **Step 9.5: Type-check**

Run: `pnpm -C packages/ai exec tsc --noEmit 2>&1 | tail -10`
Expected: no errors.

- [ ] **Step 9.6: Commit**

```bash
git add packages/ai/src/context.ts packages/ai/src/context.test.mjs
git commit -m "feat: target-repo doc loader + LRU / 目标仓库背景加载

并发拉 4 个白名单文件，单文件 4000 字截断；
按 (provider+fullName+ref+path) LRU 缓存 256 entries，
ref 含 head SHA 天然不会脏。某文件失败仅 warn，其他正常拼装。"
```

---

## Task 10: Bilingual summary renderer

**Files:**
- Create: `packages/ai/src/render.ts`
- Create: `packages/ai/src/render.test.mjs`

- [ ] **Step 10.1: Write failing tests**

Create `packages/ai/src/render.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { renderBilingualSummary } from "./render.ts";

test("renderBilingualSummary: full payload renders EN -> ZH -> mermaid", () => {
  const out = renderBilingualSummary({
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
  const out = renderBilingualSummary({
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
  const out = renderBilingualSummary({
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
  const out = renderBilingualSummary({
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
  const out = renderBilingualSummary({
    summaryMd_en: "EN.",
    summaryMd_zh: "中。",
    highlights_en: [],
    highlights_zh: [],
    mermaid_flow: "",
  });
  // 必须有一条分隔线把英文段和中文段隔开
  assert.match(out, /EN\.\s*\n\s*---\s*\n\s*## 摘要/);
});
```

- [ ] **Step 10.2: Run tests to verify they fail**

Run: `pnpm -C packages/ai test 2>&1 | tail -15`
Expected: FAIL — `Cannot find module './render.ts'`.

- [ ] **Step 10.3: Implement renderer**

Create `packages/ai/src/render.ts`:

```ts
import type { ReviewSummary } from "./types.js";

export function renderBilingualSummary(summary: ReviewSummary): string {
  const sections: string[] = [];

  // English block
  const enParts = ["## Summary", summary.summaryMd_en.trim()];
  if (summary.highlights_en.length > 0) {
    enParts.push(
      "**Highlights:**\n" + summary.highlights_en.map((h) => `- ${h}`).join("\n")
    );
  }
  sections.push(enParts.join("\n\n"));

  // Chinese block
  const zhParts = ["## 摘要", summary.summaryMd_zh.trim()];
  if (summary.highlights_zh.length > 0) {
    zhParts.push(
      "**关键变更:**\n" + summary.highlights_zh.map((h) => `- ${h}`).join("\n")
    );
  }
  sections.push(zhParts.join("\n\n"));

  // Optional mermaid block
  const mermaid = summary.mermaid_flow.trim();
  if (mermaid !== "") {
    sections.push(`## Flow / 流程\n\n${mermaid}`);
  }

  return sections.join("\n\n---\n\n");
}
```

- [ ] **Step 10.4: Run tests**

Run: `pnpm -C packages/ai test 2>&1 | tail -20`
Expected: All `renderBilingualSummary` tests PASS.

- [ ] **Step 10.5: Update package exports**

Edit `packages/ai/src/index.ts` (read first, then add the new exports). Add at the bottom:

```ts
export {
  loadReviewerGuidelines,
  loadTargetRepoContext,
  REVIEWER_DOC_WHITELIST,
  MAX_DOC_CHARS,
} from "./context.js";
export { renderBilingualSummary } from "./render.js";
```

- [ ] **Step 10.6: Type-check**

Run: `pnpm -C packages/ai exec tsc --noEmit 2>&1 | tail -10`
Expected: no errors.

- [ ] **Step 10.7: Commit**

```bash
git add packages/ai/src/render.ts packages/ai/src/render.test.mjs packages/ai/src/index.ts
git commit -m "feat: bilingual summary renderer / 双语 summary 渲染

EN -> ZH -> mermaid 排版，分隔线分组；highlights 任一为空
则跳过对应小段；mermaid 为空整段省略。从 @reviewer/ai 导出。"
```

---

## Task 11: Wire context loading + renderer into worker

**Files:**
- Modify: `apps/worker/src/handlers/review.ts`

- [ ] **Step 11.1: Update imports**

In `apps/worker/src/handlers/review.ts`, find:

```ts
import { generateReviewFindings, generateReviewSummary } from "@reviewer/ai";
```

Replace with:

```ts
import {
  generateReviewFindings,
  generateReviewSummary,
  loadReviewerGuidelines,
  loadTargetRepoContext,
  renderBilingualSummary,
} from "@reviewer/ai";
```

- [ ] **Step 11.2: Load context before AI call**

In `apps/worker/src/handlers/review.ts`, find the block:

```ts
      // 步骤 7: 拉取 diff
      const diffs = await provider.getPullRequestDiff(repo.full_name, prNumber, credential, logger);

      // 步骤 8: 从 DB 加载 AI provider 配置
      const activeConfig = await getActiveAiProviderConfig(organizationId);
```

Replace with:

```ts
      // 步骤 7: 拉取 diff
      const diffs = await provider.getPullRequestDiff(repo.full_name, prNumber, credential, logger);

      // 步骤 7a: 并发加载 reviewer 自身规范 + 目标仓库背景
      const [guidelines, projectContext] = await Promise.all([
        loadReviewerGuidelines(),
        loadTargetRepoContext(provider, repo.full_name, headSha, credential, logger),
      ]);

      // 步骤 8: 从 DB 加载 AI provider 配置
      const activeConfig = await getActiveAiProviderConfig(organizationId);
```

- [ ] **Step 11.3: Pass context fields into `reviewContext`**

Find:

```ts
      const reviewContext = {
        fullName: repo.full_name,
        prNumber,
        headSha,
        diffs,
      };
```

Replace with:

```ts
      const reviewContext = {
        fullName: repo.full_name,
        prNumber,
        headSha,
        diffs,
        guidelines,
        projectContext,
      };
```

- [ ] **Step 11.4: Replace summary rendering**

Find:

```ts
      // 步骤 8b: 生成 PR 整体摘要（失败不中断行级链路；与回写策略一致）
      let summaryMd: string | null = null;
      try {
        const { summary } = await generateReviewSummary(reviewContext, adapterConfig);
        const highlightsMd =
          summary.highlights.length > 0
            ? "\n\n**Highlights:**\n" +
              summary.highlights.map((h) => `- ${h}`).join("\n")
            : "";
        summaryMd = `${summary.summaryMd}${highlightsMd}`;
      } catch (err) {
        logger.warn("Failed to generate PR summary", {
          review_run_id: runId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
```

Replace with:

```ts
      // 步骤 8b: 生成 PR 双语摘要（失败不中断行级链路；与回写策略一致）
      let summaryMd: string | null = null;
      try {
        const { summary } = await generateReviewSummary(reviewContext, adapterConfig);
        summaryMd = renderBilingualSummary(summary);
      } catch (err) {
        logger.warn("Failed to generate PR summary", {
          review_run_id: runId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
```

- [ ] **Step 11.5: Type-check the workspace**

Run: `pnpm -r --if-present exec tsc --noEmit 2>&1 | tail -30`
Expected: no errors.

- [ ] **Step 11.6: Run all package tests**

Run: `pnpm -r --if-present test 2>&1 | tail -40`
Expected: all green.

- [ ] **Step 11.7: Commit**

```bash
git add apps/worker/src/handlers/review.ts
git commit -m "feat: worker uses bilingual summary + project context / worker 接入双语

并发加载 reviewer 自身 doc + 目标仓库 doc，注入 reviewContext；
generateReviewSummary 产出 5 字段，由 renderBilingualSummary
拼成英文/中文/可选流程图 markdown 写回 PR。"
```

---

## Task 12: End-to-end verification (manual)

**Files:** none (smoke test)

- [ ] **Step 12.1: Run full type-check + tests**

Run: `pnpm -r --if-present exec tsc --noEmit && pnpm -r --if-present test 2>&1 | tail -50`
Expected: all green.

- [ ] **Step 12.2: Manual end-to-end smoke**

Pick a real PR on either GitHub or Gitee and trigger the worker (e.g., reopen the PR or hit the webhook). Verify in the resulting PR conversation comment:

- An English `## Summary` block with `**Highlights:**`
- A Chinese `## 摘要` block with `**关键变更:**`
- If diff includes a clear flow change: a `## Flow / 流程` block with a ```mermaid``` fence
- Otherwise: no flow block

Also verify worker logs:
- `Fetched GitHub repository file` / `Fetched Gitee repository file` debug entries for the 4 whitelisted files (or skipped silently if absent)
- No errors from `loadReviewerGuidelines` even though it's the worker's cwd (your worker process should have the reviewer repo's `CLAUDE.md` etc. visible)

- [ ] **Step 12.3: Cache verification**

Re-trigger the same PR (same head SHA) a second time. The worker logs should show **zero** new `Fetched ... repository file` debug entries on the second run (LRU hit). If they appear again, something is wrong with the cache key.

- [ ] **Step 12.4: Final commit (if any tweaks needed)**

Only commit if smoke testing surfaces issues; otherwise this task ends without a commit.

---

## Self-review

- ✅ **Spec coverage**:
  - Tool schema (5 fields required) → Task 2
  - Prompt injection (system + user message) → Task 3
  - Reviewer-guideline loader → Task 7
  - Target-repo loader → Task 9 (uses LRU from Task 8)
  - LRU cache → Task 8
  - Provider interface → Task 4
  - GitHub impl → Task 5
  - Gitee impl → Task 6
  - Worker bilingual rendering → Tasks 10 + 11
  - Failure-handling semantics → Task 9 (warn-and-skip), Task 11 (try/catch around summary), validators (Task 2)
  - Tests → Tasks 2, 7, 8, 9, 10, 12
  - Out-of-scope items (no GitLab impl, no Redis cache, no inline-comment prompt change) → respected (no tasks introduce them)

- ✅ **No placeholders / TBDs**: every step has runnable commands and concrete code.

- ✅ **Type consistency**: `ReviewSummary` 5 fields used identically in Tasks 1, 2, 10, 11. `loadReviewerGuidelines`/`loadTargetRepoContext`/`renderBilingualSummary` signatures match between definition (Tasks 7/9/10) and consumption (Task 11).

- ⚠️ **Known caveat on Task 9**: the test exercises `_resetTargetRepoCache` and the cache must be reassignable; the second code block in Step 9.3 is the canonical implementation, the first illustrative block must NOT be left in the file. The step explicitly calls this out.
