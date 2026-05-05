# LangGraph 多 agent + Checkpoint Review Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 `apps/worker/src/handlers/review.ts` 里的两次单 agent LLM 调用，改造成 LangGraph 多 agent 协作 + per-finding 反思循环 + Postgres checkpoint 节点级断点恢复。

**Architecture:** 主图 = quality + security 两个 reviewer 并行 → aggregator 去重排序 → 通过 Send API 给每条 finding 派一个 critic↔regenerator 反思子图（最多 2 次）→ collect_findings → summarizer。BullMQ 仍管 job 级重试，LangGraph 管 job 内部图执行 + checkpoint。

**Tech Stack:** TypeScript / pnpm workspace / `@langchain/langgraph` + `@langchain/langgraph-checkpoint-postgres` / `@anthropic-ai/sdk` / `openai` / Postgres / BullMQ

**Design doc:** `doc/2026-04-30-langgraph-multi-agent-review-design.md`

---

## File Structure（实施前的拆分蓝图）

新增文件按**单一职责**拆分，避免单文件过大：

```
packages/ai/src/
  graph/
    state.ts              # Annotation.Root + reducers + PerFindingState/CritiqueResult 类型
    ctx-cache.ts          # in-memory Map<reviewRunId, { diffs, guidelines, projectContext }>
    router.ts             # findingRouter / fanOutFindings 纯函数（条件边逻辑）
    nodes/
      reviewer.ts         # quality / security 共用，按 focus 参数分流
      aggregator.ts       # 去重 / 排序 / 初始化 perFinding
      critic.ts           # 调 adapter.verifyFinding
      regenerator.ts      # 调 adapter.regenerateFinding
      collect.ts          # approved + exhausted 合并到 finalFindings
      summarizer.ts       # 调 adapter.generateReviewSummary（注入 finalFindings）
    index.ts              # buildReviewGraph(checkpointer) 工厂 + compile

postgres/migrations/
  0006_usage_events_agent_columns.sql
  0007_review_runs_graph_thread.sql
```

修改文件：
- `packages/ai/src/adapter.ts` — 加 `verifyFinding` / `regenerateFinding` + `focus` 参数
- `packages/ai/src/usage.ts` — `UsageContext` + `AiTaskType` 加新值
- `packages/ai/src/types.ts` — 导出新类型
- `packages/ai/src/index.ts` — 导出图工厂
- `packages/ai/package.json` — 新增三个 langchain 依赖
- `packages/core/src/repositories/usage-event.ts` — DTO + INSERT SQL 加两列
- `packages/core/src/repositories/review-run.ts` — `createReviewRun` 写 graph_thread_id
- `apps/worker/src/index.ts` — 启 PostgresSaver 单例 + 编译图、注入 handler
- `apps/worker/src/handlers/review.ts` — 步骤 8b/8c 切到 graph.invoke

---

# PR-1: Schema 迁移 + DTO 扩字段

**目标**：DB 加列 + 扩 enum + DTO 加字段。**不动业务逻辑**，跑得起来即可。

## Task 1.1: 创建 0006 迁移（usage_events 加列 + ai_task_type 扩 enum）

**Files:**
- Create: `postgres/migrations/0006_usage_events_agent_columns.sql`

- [ ] **Step 1: 写迁移 SQL**

```sql
-- 0006_usage_events_agent_columns.sql
-- 引入 LangGraph 多 agent + 反思循环后，每个 review_run 的 LLM 调用从 2 次涨到 5~30 次。
-- 加 agent_role / attempt_number 两列做归因，扩 ai_task_type enum 容纳 critic / regenerator。

-- ALTER TYPE ADD VALUE 必须在事务外执行（PG 限制），psql 默认非事务模式 OK
alter type public.ai_task_type add value if not exists 'verify_finding';
alter type public.ai_task_type add value if not exists 'regenerate_finding';

alter table public.usage_events
  add column if not exists agent_role text,
  add column if not exists attempt_number integer not null default 0;

create index if not exists idx_usage_events_review_run_agent
  on public.usage_events (review_run_id, agent_role);

comment on column public.usage_events.agent_role is
  'LangGraph agent 节点角色: quality | security | aggregator | critic | regenerator | summarizer';
comment on column public.usage_events.attempt_number is
  'critic/regenerator 反思循环里的迭代次数(0-indexed); 非反思节点固定 0';
```

- [ ] **Step 2: 跑迁移并验证**

Run: `psql $DATABASE_URL -f postgres/migrations/0006_usage_events_agent_columns.sql`

Expected: 无错误输出

Verify:
```bash
psql $DATABASE_URL -c "select column_name, data_type from information_schema.columns where table_name='usage_events' and column_name in ('agent_role','attempt_number');"
psql $DATABASE_URL -c "select unnest(enum_range(NULL::public.ai_task_type));"
```
Expected: 两列存在；enum 含 6 个值。

- [ ] **Step 3: Commit**

```bash
git add postgres/migrations/0006_usage_events_agent_columns.sql
git commit -m "feat: usage_events agent_role/attempt_number + ai_task_type enum

为 LangGraph 多 agent + 反思循环做准备。usage_events 加 agent_role / attempt_number 两列，ai_task_type 扩 verify_finding / regenerate_finding 两值。"
```

## Task 1.2: 创建 0007 迁移（review_runs 加 graph_thread_id）

**Files:**
- Create: `postgres/migrations/0007_review_runs_graph_thread.sql`

- [ ] **Step 1: 写迁移 SQL**

```sql
-- 0007_review_runs_graph_thread.sql
-- 冗余存 LangGraph thread_id（值就是 review_run.id），便于 join checkpoints 表做调试 / 巡检。

alter table public.review_runs
  add column if not exists graph_thread_id text;

create index if not exists idx_review_runs_graph_thread
  on public.review_runs (graph_thread_id);

comment on column public.review_runs.graph_thread_id is
  'LangGraph thread_id（= review_run.id 自身）；冗余存便于 join checkpoint_*';
```

- [ ] **Step 2: 跑迁移**

Run: `psql $DATABASE_URL -f postgres/migrations/0007_review_runs_graph_thread.sql`
Verify: `psql $DATABASE_URL -c "\d public.review_runs" | grep graph_thread_id`

- [ ] **Step 3: Commit**

```bash
git add postgres/migrations/0007_review_runs_graph_thread.sql
git commit -m "feat: review_runs.graph_thread_id

冗余存 LangGraph thread_id（= review_run.id），便于 join checkpoints 表做调试。"
```

## Task 1.3: 扩 `AiTaskType` + `UsageContext`（向下兼容）

**Files:**
- Modify: `packages/ai/src/usage.ts:8-12, 14-23`

- [ ] **Step 1: 扩 AiTaskType union**

`packages/ai/src/usage.ts` 第 8-12 行改为：

```ts
export type AiTaskType =
  | "review_summary"
  | "review_findings"
  | "fix_prompt"
  | "embedding"
  | "verify_finding"
  | "regenerate_finding";
```

- [ ] **Step 2: 扩 UsageContext 加 agentRole / attemptNumber**

`packages/ai/src/usage.ts` 第 14-23 行改为：

```ts
export interface UsageContext {
  organizationId: string;
  repositoryId?: string | null;
  pullRequestId?: string | null;
  reviewRunId?: string | null;
  providerConfigId?: string | null;
  provider: AiProvider;
  model: string;
  taskType: AiTaskType;
  /** LangGraph 节点角色，便于多 agent 归因；老代码不传时为 undefined。 */
  agentRole?: string;
  /** 反思循环迭代号（0-indexed）；老代码不传时为 0。 */
  attemptNumber?: number;
}
```

- [ ] **Step 3: `buildBaseDraft` 把新字段透传到 `UsageEventDraft`**

`packages/ai/src/usage.ts` 第 35-52 行 + 第 64-92 行同步改：

```ts
export interface UsageEventDraft {
  organizationId: string;
  repositoryId: string | null;
  pullRequestId: string | null;
  reviewRunId: string | null;
  providerConfigId: string | null;
  eventType: "ai_call";
  taskType: AiTaskType;
  provider: AiProvider;
  modelName: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCost: number | null;
  success: boolean;
  errorCode: string | null;
  metadata: Record<string, unknown>;
  agentRole: string | null;
  attemptNumber: number;
}
```

`buildBaseDraft` 函数返回类型同步加这两个字段；函数体内：
```ts
return {
  // ...现有字段
  agentRole: ctx.agentRole ?? null,
  attemptNumber: ctx.attemptNumber ?? 0,
};
```
（注意：`Pick<UsageEventDraft, ...>` 的 key 列表也要加上 `"agentRole"` 和 `"attemptNumber"`。）

- [ ] **Step 4: 跑现有 usage 测试，确保不回归**

Run: `pnpm --dir packages/ai exec tsx --test src/usage.test.ts`
Expected: 全部 PASS（现有用例不传新字段，默认 null/0）

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/usage.ts
git commit -m "feat: AiTaskType + UsageContext add agent_role/attempt_number

为 LangGraph 多 agent 归因做准备。AiTaskType 扩 verify_finding / regenerate_finding，UsageContext 与 UsageEventDraft 加 agentRole / attemptNumber 两个可选字段，向下兼容。"
```

## Task 1.4: `usage-event` repository INSERT 写新两列

**Files:**
- Modify: `packages/core/src/repositories/usage-event.ts:22-39, 41-91`

- [ ] **Step 1: `InsertUsageEventInput` 加两字段**

`packages/core/src/repositories/usage-event.ts` 第 22-39 行加：

```ts
export interface InsertUsageEventInput {
  organizationId: string;
  repositoryId: string | null;
  pullRequestId: string | null;
  reviewRunId: string | null;
  providerConfigId: string | null;
  eventType: string;
  taskType: string | null;
  provider: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  estimatedCost: number | null;
  success: boolean | null;
  errorCode: string | null;
  metadata?: Record<string, unknown>;
  agentRole?: string | null;
  attemptNumber?: number;
}
```

- [ ] **Step 2: INSERT SQL 加两列**

`packages/core/src/repositories/usage-event.ts` 第 47-75 行改为：

```ts
const result = await getPool().query<{ id: string }>(
  `insert into public.usage_events
     (organization_id, repository_id, pull_request_id, review_run_id,
      provider_config_id, event_type, task_type, provider, model_name,
      input_tokens, output_tokens, latency_ms, estimated_cost,
      success, error_code, metadata, agent_role, attempt_number)
   values
     ($1, $2, $3, $4, $5, $6, $7::public.ai_task_type,
      $8::public.ai_provider, $9, $10, $11, $12, $13, $14, $15, $16::jsonb,
      $17, $18)
   returning id`,
  [
    input.organizationId,
    input.repositoryId,
    input.pullRequestId,
    input.reviewRunId,
    input.providerConfigId,
    input.eventType,
    input.taskType,
    input.provider,
    input.modelName,
    input.inputTokens,
    input.outputTokens,
    input.latencyMs,
    input.estimatedCost,
    input.success,
    input.errorCode,
    JSON.stringify(input.metadata ?? {}),
    input.agentRole ?? null,
    input.attemptNumber ?? 0,
  ]
);
```

- [ ] **Step 3: handler 的 usageRecorder 透传新字段**

`apps/worker/src/handlers/review.ts` 第 145-164 行 `usageRecorder` 改为：

```ts
const usageRecorder: UsageRecorder = async (draft) => {
  await insertUsageEvent({
    organizationId: draft.organizationId,
    repositoryId: draft.repositoryId,
    pullRequestId: draft.pullRequestId,
    reviewRunId: draft.reviewRunId,
    providerConfigId: draft.providerConfigId,
    eventType: draft.eventType,
    taskType: draft.taskType,
    provider: draft.provider,
    modelName: draft.modelName,
    inputTokens: draft.inputTokens,
    outputTokens: draft.outputTokens,
    latencyMs: draft.latencyMs,
    estimatedCost: draft.estimatedCost,
    success: draft.success,
    errorCode: draft.errorCode,
    metadata: draft.metadata,
    agentRole: draft.agentRole,
    attemptNumber: draft.attemptNumber,
  });
};
```

- [ ] **Step 4: typecheck**

Run: `pnpm --dir packages/core run typecheck && pnpm --dir packages/ai run typecheck && pnpm --dir apps/worker run typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/repositories/usage-event.ts apps/worker/src/handlers/review.ts
git commit -m "feat: insertUsageEvent persists agent_role + attempt_number

InsertUsageEventInput 加两字段，SQL INSERT 写入新列；handler 的 usageRecorder 透传 draft 里的新字段。"
```

## Task 1.5: `createReviewRun` 写 `graph_thread_id`

**Files:**
- Modify: `packages/core/src/repositories/review-run.ts:33-82`

- [ ] **Step 1: INSERT 加 graph_thread_id 列**

`packages/core/src/repositories/review-run.ts:39-50` 改为：

```ts
const result = await getPool().query<{ id: string }>(
  `with new_run as (
     insert into public.review_runs
       (organization_id, repository_id, pull_request_id, run_number,
        trigger_type, trigger_event_id, review_mode, output_language,
        status, base_sha, head_sha, queue_job_id, rule_snapshot)
     values (
       $1, $2, $3,
       (select coalesce(max(run_number), 0) + 1
          from public.review_runs
         where pull_request_id = $3),
       $4, $5, 'standard', 'en-US',
       'queued', $6, $7, $8, '{}'
     )
     returning id
   )
   update public.review_runs
      set graph_thread_id = new_run.id
     from new_run
    where public.review_runs.id = new_run.id
   returning public.review_runs.id`,
  [...]  // 参数不变
);
```

> 写入用 CTE 一次完成 INSERT + 回填 thread_id（避免再发一次 UPDATE）。

- [ ] **Step 2: typecheck**

Run: `pnpm --dir packages/core run typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/repositories/review-run.ts
git commit -m "feat: createReviewRun writes graph_thread_id

新建的 review_run 把自身 id 同步写入 graph_thread_id 列，作为 LangGraph thread 的 join key。"
```

## Task 1.6: 全量验证

- [ ] **Step 1: 跑全量 check**

Run: `pnpm check`
Expected: lint + typecheck + test 全绿

- [ ] **Step 2: PR-1 收尾，开 PR**

```bash
git push -u origin feat/langgraph-multi-agent-review
# 此时分支上所有提交即 PR-1 内容；后续 PR-2~5 合并到同一分支即可累积
```

---

# PR-2: Adapter 新方法 + Prompt focus

**目标**：adapter 加 `verifyFinding` / `regenerateFinding`，扩 `generateReviewFindings(focus)` / `generateReviewSummary(finalFindings)`。**handler 暂不调用**。

> 这一轮全部用 TDD：先在 `packages/ai/src/adapter.test.ts`（新建）写失败测试，再实现。每个方法独立提交。

## Task 2.1: 加 `focus` 参数到 `generateReviewFindings`

**Files:**
- Modify: `packages/ai/src/types.ts:3-16` — `ReviewContext` 加 `focus?: "quality" | "security"` 可选字段
- Modify: `packages/ai/src/adapter.ts:205-230` — `buildUserMessage` 接收 focus 拼不同 prompt
- Modify: `packages/ai/src/adapter.ts:376-440, 540-600` — Anthropic + OpenAI adapter 透传

- [ ] **Step 1: types.ts 加 focus**

`packages/ai/src/types.ts` 的 `ReviewContext` 加：

```ts
export type ReviewFocus = "quality" | "security";

export interface ReviewContext {
  // ...现有字段
  /** 限定 reviewer 只看某一类问题；不传则像旧逻辑一样综合扫描。 */
  focus?: ReviewFocus;
}
```

- [ ] **Step 2: 写测试 — focus=quality 时 prompt 含关键词，不含 security 关键词**

新建 `packages/ai/src/adapter.test.ts`：

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { _internalForTest } from "./adapter.js"; // 见下一步导出

describe("buildUserMessage with focus", () => {
  const baseCtx = {
    fullName: "owner/repo", prNumber: 1, headSha: "sha",
    diffs: [], guidelines: "", projectContext: "",
    organizationId: "o", repositoryId: "r", pullRequestId: "p",
    reviewRunId: "rr", providerConfigId: "pc",
  };

  it("focus=quality includes quality keyword and excludes security framing", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, focus: "quality" }, "DIFF"
    );
    assert.match(msg, /quality/i);
    assert.doesNotMatch(msg, /only.*security/i);
  });

  it("focus=security tells reviewer to ignore quality-only issues", () => {
    const msg = _internalForTest.buildUserMessage(
      { ...baseCtx, focus: "security" }, "DIFF"
    );
    assert.match(msg, /security/i);
  });

  it("no focus keeps existing comprehensive prompt", () => {
    const msg = _internalForTest.buildUserMessage(baseCtx, "DIFF");
    assert.match(msg, /report_findings/);
  });
});
```

- [ ] **Step 3: adapter.ts 导出测试 hook**

`packages/ai/src/adapter.ts` 文件末尾加：

```ts
// Test-only export. Do NOT use from production code.
export const _internalForTest = {
  buildUserMessage,
  buildSummaryUserMessage,
  validateAndNormalizeFindings,
  validateAndNormalizeSummary,
};
```

- [ ] **Step 4: 跑测试，确认失败**

Run: `pnpm --dir packages/ai exec tsx --test src/adapter.test.ts`
Expected: FAIL（buildUserMessage 还没接 focus）

- [ ] **Step 5: 改 `buildUserMessage` 接 focus**

`packages/ai/src/adapter.ts:205` 的 `buildUserMessage` 改为：

```ts
function buildUserMessage(context: ReviewContext, diffText: string): string {
  const focusBlock = context.focus === "quality"
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
```

- [ ] **Step 6: 跑测试，确认通过**

Run: `pnpm --dir packages/ai exec tsx --test src/adapter.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/types.ts packages/ai/src/adapter.ts packages/ai/src/adapter.test.ts
git commit -m "feat: ReviewContext.focus narrows reviewer prompt

quality 与 security 两路 reviewer 用同一份 schema，prompt 通过 focus 参数收敛 scope。新增 _internalForTest 暴露 buildUserMessage 给单测。"
```

## Task 2.2: Adapter 新增 `verifyFinding`

**Files:**
- Modify: `packages/ai/src/types.ts` — 新增 `CritiqueResult` 类型
- Modify: `packages/ai/src/adapter.ts` — `AiAdapter` 接口加方法 + 两个 adapter 实现
- Test: `packages/ai/src/adapter.verify.test.ts`（新建）

- [ ] **Step 1: 类型定义**

`packages/ai/src/types.ts` 加：

```ts
export interface CritiqueResult {
  /** finding 是否可以接受发布。 */
  valid: boolean;
  /** 不通过原因 / 补充说明，单语英文，落 metadata 用。 */
  reason: string;
  /** critic 给出的修正版本；exhausted 时由 collect_findings 兜底使用。 */
  patchedFinding?: ReviewFinding;
  /** 0~1。critic 对自己判断的置信度。 */
  confidenceScore: number;
}
```

`AiAdapter` 接口（`packages/ai/src/adapter.ts:67-70`）加：

```ts
export interface AiAdapter {
  generateReviewFindings(context: ReviewContext): Promise<ReviewResult>;
  generateReviewSummary(context: ReviewContext): Promise<ReviewSummaryResult>;
  verifyFinding(finding: ReviewFinding, context: ReviewContext): Promise<CritiqueResult>;
  regenerateFinding(
    finding: ReviewFinding,
    critique: CritiqueResult,
    context: ReviewContext
  ): Promise<ReviewFinding>;
}
```

- [ ] **Step 2: 加 VERIFY_SCHEMA**

`packages/ai/src/adapter.ts` 在 FINDINGS_SCHEMA 后加：

```ts
const VERIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    valid: { type: "boolean" as const },
    reason: { type: "string" as const },
    confidenceScore: { type: "number" as const, minimum: 0, maximum: 1 },
    patchedFinding: {
      type: "object" as const,
      properties: FINDINGS_SCHEMA.properties.findings.items.properties,
      required: FINDINGS_SCHEMA.properties.findings.items.required,
    },
  },
  required: ["valid", "reason", "confidenceScore"] as string[],
};
```

- [ ] **Step 3: 写 buildVerifyUserMessage**

```ts
function buildVerifyUserMessage(
  finding: ReviewFinding,
  context: ReviewContext
): string {
  const targetDiff = context.diffs.find(d => d.filePath === finding.filePath)?.patch ?? "(diff not found)";
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

const VERIFY_SYSTEM_PROMPT =
  "You are a code review auditor. Your only job is to verify whether a draft finding is correct and useful. Be skeptical: reject hallucinated bugs, mismatched line ranges, and findings whose suggestion does not actually fix the problem. When the finding is mostly right but flawed, return valid=false with patchedFinding fixed.";
```

- [ ] **Step 4: 写失败测试**

新建 `packages/ai/src/adapter.verify.test.ts`：

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AnthropicAdapter } from "./adapter.js";

describe("AnthropicAdapter.verifyFinding", () => {
  it("returns valid=true when LLM tool says ok", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "test", model: "claude-x" });
    // 注入 fake client
    (adapter as any).client = {
      messages: {
        create: async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [{
            type: "tool_use", name: "verify_finding",
            input: { valid: true, reason: "ok", confidenceScore: 0.9 },
          }],
        }),
      },
    };
    const result = await adapter.verifyFinding(
      { filePath: "a.ts", startLine: 1, endLine: 1, side: "RIGHT",
        issueType: "quality", severity: "low",
        title_en: "t", title_zh: "t",
        summary_en: "s", summary_zh: "s",
        suggestion_en: "g", suggestion_zh: "g",
        aiPrompt: "p", confidenceScore: 0.5 },
      { fullName: "o/r", prNumber: 1, headSha: "h", diffs: [],
        guidelines: "", projectContext: "",
        organizationId: "o", repositoryId: "r",
        pullRequestId: "p", reviewRunId: "rr", providerConfigId: "pc" }
    );
    assert.equal(result.valid, true);
    assert.equal(result.reason, "ok");
  });

  it("returns valid=false with patchedFinding when LLM proposes correction", async () => {
    const adapter = new AnthropicAdapter({ apiKey: "test", model: "claude-x" });
    (adapter as any).client = {
      messages: {
        create: async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [{
            type: "tool_use", name: "verify_finding",
            input: {
              valid: false, reason: "wrong line",
              confidenceScore: 0.7,
              patchedFinding: { filePath: "a.ts", startLine: 5, endLine: 5,
                side: "RIGHT", issueType: "quality", severity: "low",
                title_en: "t2", title_zh: "t2",
                summary_en: "s2", summary_zh: "s2",
                suggestion_en: "g2", suggestion_zh: "g2",
                aiPrompt: "p2", confidenceScore: 0.6 },
            },
          }],
        }),
      },
    };
    const result = await adapter.verifyFinding(/* ...same args... */);
    assert.equal(result.valid, false);
    assert.ok(result.patchedFinding);
    assert.equal(result.patchedFinding!.startLine, 5);
  });
});
```

- [ ] **Step 5: 跑测试，确认失败**

Run: `pnpm --dir packages/ai exec tsx --test src/adapter.verify.test.ts`
Expected: FAIL（verifyFinding 还未实现）

- [ ] **Step 6: 实现 AnthropicAdapter.verifyFinding**

在 `AnthropicAdapter` class 内（`packages/ai/src/adapter.ts:360+`）加：

```ts
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
        messages: [{ role: "user", content: buildVerifyUserMessage(finding, context) }],
        tools: [{
          name: "verify_finding",
          description: "Audit a draft code review finding.",
          input_scenario: VERIFY_SCHEMA as Anthropic.Tool["input_schema"],
        } as Anthropic.Tool],
        tool_choice: { type: "tool", name: "verify_finding" },
      });

      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      if (!toolUse) throw new Error("verify_finding: no tool_use block");

      const input = toolUse.input as {
        valid: boolean;
        reason: string;
        confidenceScore: number;
        patchedFinding?: ReviewFinding;
      };

      return {
        result: {
          valid: input.valid,
          reason: input.reason,
          confidenceScore: Math.min(1, Math.max(0, input.confidenceScore)),
          patchedFinding: input.patchedFinding,
        },
        outcome: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          truncated: response.stop_reason === "max_tokens",
        },
      };
    },
    this.recorder,
    usageLogger
  );
}
```

> `buildUsageCtx` 是文件内已有 helper（adapter.ts:45），新增 `agentRole`/`attemptNumber` 字段会通过 Task 1.3 已扩好的 `UsageContext` 透传。

- [ ] **Step 7: 同样实现 OpenAICompatibleAdapter.verifyFinding**

参照 `OpenAICompatibleAdapter.generateReviewFindings`（adapter.ts:540-600），结构相同：
- `tools: [{ type: "function", function: { name: "verify_finding", parameters: VERIFY_SCHEMA } }]`
- `tool_choice: { type: "function", function: { name: "verify_finding" } }`
- 解析 `tool_calls[0].function.arguments`（JSON.parse）后映射到 CritiqueResult
- 同样调 `withUsageInstrumentation` 并设 `agentRole: "critic"`

> 复用现有的 `extractJsonFromText`（adapter.ts:270）做兜底解析。

- [ ] **Step 8: 跑测试**

Run: `pnpm --dir packages/ai exec tsx --test src/adapter.verify.test.ts src/adapter.test.ts`
Expected: 全 PASS

- [ ] **Step 9: Commit**

```bash
git add packages/ai/src/types.ts packages/ai/src/adapter.ts packages/ai/src/adapter.verify.test.ts
git commit -m "feat: AiAdapter.verifyFinding for critic agent

新增 verifyFinding 方法 + VERIFY_SCHEMA / buildVerifyUserMessage / VERIFY_SYSTEM_PROMPT。Anthropic + OpenAI 两个 adapter 都实现，usage 走 verify_finding task_type + agentRole=critic。"
```

## Task 2.3: Adapter 新增 `regenerateFinding`

**Files:** 同 Task 2.2，再加 `REGENERATE_SCHEMA` / `buildRegenerateUserMessage` / `REGENERATE_SYSTEM_PROMPT`

- [ ] **Step 1: REGENERATE_SCHEMA + prompt**

```ts
// 复用 FINDINGS_SCHEMA.properties.findings.items 作为 schema（一条 finding 的 shape）
const REGENERATE_SCHEMA = {
  type: "object" as const,
  properties: {
    finding: FINDINGS_SCHEMA.properties.findings.items,
  },
  required: ["finding"],
};

const REGENERATE_SYSTEM_PROMPT =
  "You are a code reviewer fixing a draft finding that an auditor rejected. Read the auditor's reason carefully, then rewrite the finding so the issue is real, the line range matches the diff, and bilingual fields are complete. Return the corrected finding via the report_finding tool.";

function buildRegenerateUserMessage(
  finding: ReviewFinding,
  critique: CritiqueResult,
  context: ReviewContext
): string {
  const targetDiff = context.diffs.find(d => d.filePath === finding.filePath)?.patch ?? "(diff not found)";
  return `Auditor rejected the following draft finding for pull request #${context.prNumber} in ${context.fullName}:

<auditor_reason>
${critique.reason}
</auditor_reason>

<draft_finding>
${JSON.stringify(finding, null, 2)}
</draft_finding>

${critique.patchedFinding ? `<auditor_proposed_patch>\n${JSON.stringify(critique.patchedFinding, null, 2)}\n</auditor_proposed_patch>\n\n` : ""}

<diff_for_${finding.filePath}>
\`\`\`diff
${targetDiff}
\`\`\`
</diff_for_${finding.filePath}>

Rewrite the finding to address the auditor's reason. Keep the bilingual structure; do not regress existing-good fields. Call the \`report_finding\` tool with the corrected finding.`;
}
```

- [ ] **Step 2: 写失败测试** （`packages/ai/src/adapter.regenerate.test.ts`，结构对照 Task 2.2 Step 4）

- [ ] **Step 3: 跑确认失败**

Run: `pnpm --dir packages/ai exec tsx --test src/adapter.regenerate.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 AnthropicAdapter.regenerateFinding**

```ts
async regenerateFinding(
  finding: ReviewFinding,
  critique: CritiqueResult,
  context: ReviewContext
): Promise<ReviewFinding> {
  return withUsageInstrumentation(
    {
      ...buildUsageCtx(context, this.provider, this.model, "regenerate_finding"),
      agentRole: "regenerator",
      attemptNumber: 0, // 由调用方（critic 节点）覆盖
    },
    async () => {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: REGENERATE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildRegenerateUserMessage(finding, critique, context) }],
        tools: [{
          name: "report_finding",
          description: "Return a corrected single finding.",
          input_schema: REGENERATE_SCHEMA as Anthropic.Tool["input_schema"],
        } as Anthropic.Tool],
        tool_choice: { type: "tool", name: "report_finding" },
      });

      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      if (!toolUse) throw new Error("report_finding: no tool_use block");

      const input = toolUse.input as { finding: ReviewFinding };
      return {
        result: input.finding,
        outcome: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          truncated: response.stop_reason === "max_tokens",
        },
      };
    },
    this.recorder,
    usageLogger
  );
}
```

- [ ] **Step 5: OpenAICompatibleAdapter.regenerateFinding** （结构镜像，使用 OpenAI tool calling 协议）

- [ ] **Step 6: 跑测试**

Run: `pnpm --dir packages/ai exec tsx --test src/adapter.regenerate.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/adapter.ts packages/ai/src/adapter.regenerate.test.ts
git commit -m "feat: AiAdapter.regenerateFinding for revision loop

新增 regenerateFinding 方法。两个 adapter 都实现；usage 走 regenerate_finding task_type + agentRole=regenerator。"
```

## Task 2.4: `generateReviewSummary` 接收 finalFindings 上下文

**Files:**
- Modify: `packages/ai/src/types.ts` — `ReviewContext` 加 `finalFindings?: ReviewFinding[]`
- Modify: `packages/ai/src/adapter.ts:232-256` — `buildSummaryUserMessage` 注入 finalFindings 摘要

- [ ] **Step 1: types.ts 加字段**

```ts
export interface ReviewContext {
  // ...
  /** 当 summarizer 跑在 critic 之后时，注入过滤后的最终 findings 让 summary 反映真实问题清单。 */
  finalFindings?: ReviewFinding[];
}
```

- [ ] **Step 2: 改 buildSummaryUserMessage**

`packages/ai/src/adapter.ts:232` 函数体内在 `<diff>` 块前加：

```ts
const findingsBlock = context.finalFindings && context.finalFindings.length > 0
  ? `\n<verified_findings>\n${context.finalFindings.map((f, i) =>
      `${i + 1}. [${f.severity}/${f.issueType}] ${f.filePath}:${f.startLine}–${f.endLine} — ${f.title_en}`
    ).join("\n")}\n</verified_findings>\n\nThese are the final, auditor-verified findings. Reference them when describing risks but do not duplicate the per-finding details.\n`
  : "";

return `... ${findingsBlock} ... <diff>${diffText}</diff>`;
```

- [ ] **Step 3: 测试 — finalFindings 出现时 prompt 含 verified_findings 块**

`packages/ai/src/adapter.test.ts` 加：

```ts
it("buildSummaryUserMessage embeds finalFindings list when provided", () => {
  const msg = _internalForTest.buildSummaryUserMessage(
    { ...baseCtx, finalFindings: [{
      filePath: "a.ts", startLine: 1, endLine: 2, side: "RIGHT",
      issueType: "security", severity: "high",
      title_en: "SQL injection", title_zh: "SQL 注入",
      summary_en: "", summary_zh: "",
      suggestion_en: "", suggestion_zh: "",
      aiPrompt: "", confidenceScore: 0.8,
    }] },
    "DIFF"
  );
  assert.match(msg, /verified_findings/);
  assert.match(msg, /SQL injection/);
});

it("buildSummaryUserMessage skips block when no finalFindings", () => {
  const msg = _internalForTest.buildSummaryUserMessage(baseCtx, "DIFF");
  assert.doesNotMatch(msg, /verified_findings/);
});
```

- [ ] **Step 4: 跑测试**

Run: `pnpm --dir packages/ai exec tsx --test src/adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/types.ts packages/ai/src/adapter.ts packages/ai/src/adapter.test.ts
git commit -m "feat: summary prompt includes verified findings

ReviewContext.finalFindings 提供时，buildSummaryUserMessage 注入 verified_findings 块；不传时 prompt 与原版兼容。"
```

## Task 2.5: PR-2 收尾验证

- [ ] **Step 1:** Run `pnpm check`
- [ ] **Step 2:** Push 分支

---

# PR-3: 图骨架（不接入 handler）

**目标**：装依赖、写 state / nodes / router / 图组装、用 MemorySaver 做端到端测试。**handler 不动**。

## Task 3.1: 装依赖

**Files:**
- Modify: `packages/ai/package.json`

- [ ] **Step 1: 装包**

Run:
```bash
pnpm --dir packages/ai add @langchain/langgraph @langchain/core
pnpm --dir apps/worker add @langchain/langgraph-checkpoint-postgres
```

> checkpoint-postgres 装在 apps/worker：只有 worker 进程需要 PostgresSaver；ai 包保持 saver-agnostic（测试用 MemorySaver 来自 @langchain/langgraph 自身）。

- [ ] **Step 2: typecheck**

Run: `pnpm --dir packages/ai run typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/ai/package.json apps/worker/package.json pnpm-lock.yaml
git commit -m "chore: add @langchain/langgraph for review graph

packages/ai 加 @langchain/langgraph + @langchain/core；apps/worker 加 @langchain/langgraph-checkpoint-postgres。"
```

## Task 3.2: ctx-cache

**Files:**
- Create: `packages/ai/src/graph/ctx-cache.ts`
- Test: `packages/ai/src/graph/ctx-cache.test.ts`

- [ ] **Step 1: 写测试**

```ts
// ctx-cache.test.ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setCtx, getCtx, clearCtx } from "./ctx-cache.js";

describe("ctx-cache", () => {
  beforeEach(() => clearCtx("rr-1"));

  it("set then get returns the same object", () => {
    setCtx("rr-1", { diffs: [], guidelines: "g", projectContext: "p" } as any);
    const c = getCtx("rr-1");
    assert.equal(c?.guidelines, "g");
  });

  it("clear removes the entry", () => {
    setCtx("rr-1", { diffs: [], guidelines: "", projectContext: "" } as any);
    clearCtx("rr-1");
    assert.equal(getCtx("rr-1"), undefined);
  });

  it("missing key returns undefined", () => {
    assert.equal(getCtx("nope"), undefined);
  });
});
```

- [ ] **Step 2: 实现**

```ts
// ctx-cache.ts
import type { GitDiff } from "@reviewer/git";

export interface ReviewCtxCacheEntry {
  diffs: GitDiff[];
  guidelines: string;
  projectContext: string;
}

const cache = new Map<string, ReviewCtxCacheEntry>();

export function setCtx(reviewRunId: string, entry: ReviewCtxCacheEntry): void {
  cache.set(reviewRunId, entry);
}

export function getCtx(reviewRunId: string): ReviewCtxCacheEntry | undefined {
  return cache.get(reviewRunId);
}

export function clearCtx(reviewRunId: string): void {
  cache.delete(reviewRunId);
}
```

- [ ] **Step 3: 跑测试 → PASS**

Run: `pnpm --dir packages/ai exec tsx --test src/graph/ctx-cache.test.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/graph/ctx-cache.ts packages/ai/src/graph/ctx-cache.test.ts
git commit -m "feat: in-memory ctx-cache for review graph

进程内 Map<reviewRunId, {diffs, guidelines, projectContext}>，让大对象不进 LangGraph state，避免 checkpoint 表膨胀。"
```

## Task 3.3: state.ts

**Files:**
- Create: `packages/ai/src/graph/state.ts`
- Test: `packages/ai/src/graph/state.test.ts`

- [ ] **Step 1: 写 state 定义**

```ts
// state.ts
import { Annotation } from "@langchain/langgraph";
import type { ReviewFinding, CritiqueResult, ReviewSummary } from "../types.js";

export interface PerFindingState {
  finding: ReviewFinding;
  attempts: number;
  lastCritique: CritiqueResult | null;
  status: "pending" | "approved" | "exhausted";
}

export interface ReviewContextRef {
  fullName: string;
  prNumber: number;
  headSha: string;
  organizationId: string;
  repositoryId: string;
  pullRequestId: string;
  reviewRunId: string;
  providerConfigId: string;
}

export const ReviewGraphState = Annotation.Root({
  reviewRunId: Annotation<string>({
    reducer: (_l, r) => r,
    default: () => "",
  }),
  context: Annotation<ReviewContextRef>({
    reducer: (_l, r) => r,
    default: () => ({} as ReviewContextRef),
  }),
  draftFindings: Annotation<ReviewFinding[]>({
    reducer: (l, r) => [...l, ...r],
    default: () => [],
  }),
  reviewerErrors: Annotation<Array<{ role: string; error: string }>>({
    reducer: (l, r) => [...l, ...r],
    default: () => [],
  }),
  aggregatedFindings: Annotation<ReviewFinding[]>({
    reducer: (_l, r) => r,
    default: () => [],
  }),
  perFinding: Annotation<Record<string, PerFindingState>>({
    reducer: (l, r) => ({ ...l, ...r }),
    default: () => ({}),
  }),
  finalFindings: Annotation<ReviewFinding[]>({
    reducer: (_l, r) => r,
    default: () => [],
  }),
  summary: Annotation<ReviewSummary | null>({
    reducer: (_l, r) => r,
    default: () => null,
  }),
});

export type ReviewGraphStateType = typeof ReviewGraphState.State;
```

- [ ] **Step 2: 写 reducer 行为测试**

```ts
// state.test.ts — 用 Annotation 实例直接验 reducer
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ReviewGraphState } from "./state.js";

describe("ReviewGraphState reducers", () => {
  it("draftFindings appends", () => {
    // append reducer 是函数，提取出来直接调
    const spec = (ReviewGraphState as any).spec.draftFindings;
    const reducer = spec.reducer;
    const result = reducer([{ a: 1 }], [{ a: 2 }]);
    assert.deepEqual(result, [{ a: 1 }, { a: 2 }]);
  });

  it("aggregatedFindings overwrites", () => {
    const reducer = (ReviewGraphState as any).spec.aggregatedFindings.reducer;
    assert.deepEqual(reducer([{ a: 1 }], [{ a: 2 }]), [{ a: 2 }]);
  });

  it("perFinding merges by key", () => {
    const reducer = (ReviewGraphState as any).spec.perFinding.reducer;
    const merged = reducer({ k1: 1 }, { k2: 2 });
    assert.deepEqual(merged, { k1: 1, k2: 2 });
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm --dir packages/ai exec tsx --test src/graph/state.test.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/graph/state.ts packages/ai/src/graph/state.test.ts
git commit -m "feat: ReviewGraphState annotation + reducers

state 定义 Annotation.Root: draftFindings(append) / aggregatedFindings(overwrite) / perFinding(merge by key) / finalFindings + summary(overwrite)。"
```

## Task 3.4: aggregator 节点

**Files:**
- Create: `packages/ai/src/graph/nodes/aggregator.ts`
- Test: `packages/ai/src/graph/nodes/aggregator.test.ts`

- [ ] **Step 1: 写 fingerprint helper（复用 review-issue 风格）**

```ts
// aggregator.ts
import { createHash } from "node:crypto";
import type { ReviewFinding } from "../../types.js";
import type { ReviewGraphStateType, PerFindingState } from "../state.js";

export function findingKey(repositoryId: string, f: ReviewFinding): string {
  return createHash("sha256")
    .update(`${repositoryId}:${f.filePath}:${f.startLine}:${f.title_en}`)
    .digest("hex");
}

const SEVERITY_RANK: Record<ReviewFinding["severity"], number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

export async function aggregator(
  state: ReviewGraphStateType
): Promise<Partial<ReviewGraphStateType>> {
  const repositoryId = state.context.repositoryId;
  const seen = new Map<string, ReviewFinding>();

  for (const f of state.draftFindings) {
    const key = findingKey(repositoryId, f);
    if (!seen.has(key)) seen.set(key, f);
  }

  const sorted = [...seen.values()].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return a.filePath.localeCompare(b.filePath);
  });

  const perFinding: Record<string, PerFindingState> = {};
  for (const f of sorted) {
    perFinding[findingKey(repositoryId, f)] = {
      finding: f, attempts: 0, lastCritique: null, status: "pending",
    };
  }

  return { aggregatedFindings: sorted, perFinding };
}
```

- [ ] **Step 2: 写测试**

```ts
// aggregator.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregator, findingKey } from "./aggregator.js";

const baseFinding = {
  side: "RIGHT" as const, issueType: "quality" as const,
  title_zh: "", summary_en: "", summary_zh: "",
  suggestion_en: "", suggestion_zh: "",
  aiPrompt: "", confidenceScore: 0.5,
};

describe("aggregator", () => {
  it("dedupes findings with same fingerprint", async () => {
    const result = await aggregator({
      reviewRunId: "", context: { repositoryId: "r", /*...*/ } as any,
      draftFindings: [
        { ...baseFinding, filePath: "a.ts", startLine: 1, endLine: 1, severity: "high", title_en: "X" },
        { ...baseFinding, filePath: "a.ts", startLine: 1, endLine: 1, severity: "high", title_en: "X" },
      ],
      reviewerErrors: [], aggregatedFindings: [], perFinding: {},
      finalFindings: [], summary: null,
    });
    assert.equal(result.aggregatedFindings!.length, 1);
    assert.equal(Object.keys(result.perFinding!).length, 1);
  });

  it("sorts by severity (critical first)", async () => {
    const result = await aggregator({
      reviewRunId: "", context: { repositoryId: "r" } as any,
      draftFindings: [
        { ...baseFinding, filePath: "a.ts", startLine: 1, endLine: 1, severity: "low", title_en: "L" },
        { ...baseFinding, filePath: "a.ts", startLine: 2, endLine: 2, severity: "critical", title_en: "C" },
      ],
      reviewerErrors: [], aggregatedFindings: [], perFinding: {},
      finalFindings: [], summary: null,
    });
    assert.equal(result.aggregatedFindings![0]!.severity, "critical");
  });

  it("initializes perFinding entries to status=pending, attempts=0", async () => {
    const result = await aggregator({
      reviewRunId: "", context: { repositoryId: "r" } as any,
      draftFindings: [{ ...baseFinding, filePath: "a.ts", startLine: 1, endLine: 1, severity: "low", title_en: "X" }],
      reviewerErrors: [], aggregatedFindings: [], perFinding: {},
      finalFindings: [], summary: null,
    });
    const entry = Object.values(result.perFinding!)[0]!;
    assert.equal(entry.status, "pending");
    assert.equal(entry.attempts, 0);
    assert.equal(entry.lastCritique, null);
  });
});
```

- [ ] **Step 3: 跑测试 → PASS**

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/graph/nodes/aggregator.ts packages/ai/src/graph/nodes/aggregator.test.ts
git commit -m "feat: aggregator node dedupes + sorts findings

按 sha256(repositoryId:filePath:startLine:title_en) 去重，按 severity desc 排序，初始化 perFinding state 为 pending。"
```

## Task 3.5: reviewer 节点（quality / security 共享）

**Files:**
- Create: `packages/ai/src/graph/nodes/reviewer.ts`
- Test: `packages/ai/src/graph/nodes/reviewer.test.ts`

- [ ] **Step 1: 实现**

```ts
// reviewer.ts
import type { AiAdapter } from "../../adapter.js";
import type { ReviewFocus } from "../../types.js";
import type { ReviewGraphStateType } from "../state.js";
import { getCtx } from "../ctx-cache.js";

export function makeReviewerNode(
  focus: ReviewFocus,
  adapter: AiAdapter
) {
  return async function reviewer(
    state: ReviewGraphStateType
  ): Promise<Partial<ReviewGraphStateType>> {
    const ctx = getCtx(state.reviewRunId);
    if (!ctx) {
      return {
        reviewerErrors: [{ role: focus, error: "ctx-cache miss" }],
      };
    }

    try {
      const { findings } = await adapter.generateReviewFindings({
        ...state.context,
        diffs: ctx.diffs,
        guidelines: ctx.guidelines,
        projectContext: ctx.projectContext,
        focus,
      });
      return { draftFindings: findings };
    } catch (err) {
      return {
        reviewerErrors: [{
          role: focus,
          error: err instanceof Error ? err.message : String(err),
        }],
      };
    }
  };
}
```

- [ ] **Step 2: 写测试（mock adapter）**

```ts
// reviewer.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeReviewerNode } from "./reviewer.js";
import { setCtx, clearCtx } from "../ctx-cache.js";

const fakeFinding = {
  filePath: "a.ts", startLine: 1, endLine: 1, side: "RIGHT" as const,
  issueType: "quality" as const, severity: "low" as const,
  title_en: "x", title_zh: "x", summary_en: "x", summary_zh: "x",
  suggestion_en: "x", suggestion_zh: "x", aiPrompt: "x", confidenceScore: 0.5,
};

describe("reviewer node", () => {
  it("returns draftFindings on success", async () => {
    setCtx("rr", { diffs: [], guidelines: "", projectContext: "" });
    const adapter = {
      generateReviewFindings: async (_ctx: any) => ({ findings: [fakeFinding] }),
    } as any;
    const node = makeReviewerNode("quality", adapter);
    const result = await node({
      reviewRunId: "rr", context: {} as any,
      draftFindings: [], reviewerErrors: [], aggregatedFindings: [],
      perFinding: {}, finalFindings: [], summary: null,
    });
    assert.equal(result.draftFindings!.length, 1);
    clearCtx("rr");
  });

  it("returns reviewerErrors when adapter throws", async () => {
    setCtx("rr", { diffs: [], guidelines: "", projectContext: "" });
    const adapter = {
      generateReviewFindings: async () => { throw new Error("API down"); },
    } as any;
    const node = makeReviewerNode("security", adapter);
    const result = await node({
      reviewRunId: "rr", context: {} as any,
      draftFindings: [], reviewerErrors: [], aggregatedFindings: [],
      perFinding: {}, finalFindings: [], summary: null,
    });
    assert.equal(result.reviewerErrors![0]!.role, "security");
    clearCtx("rr");
  });

  it("logs error when ctx-cache miss", async () => {
    const adapter = { generateReviewFindings: async () => ({ findings: [] }) } as any;
    const node = makeReviewerNode("quality", adapter);
    const result = await node({
      reviewRunId: "missing", context: {} as any,
      draftFindings: [], reviewerErrors: [], aggregatedFindings: [],
      perFinding: {}, finalFindings: [], summary: null,
    });
    assert.match(result.reviewerErrors![0]!.error, /ctx-cache miss/);
  });
});
```

- [ ] **Step 3: 跑测试 → PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/graph/nodes/reviewer.ts packages/ai/src/graph/nodes/reviewer.test.ts
git commit -m "feat: reviewer node factory (quality / security share impl)

makeReviewerNode(focus, adapter) 返回闭包节点；从 ctx-cache 取 diffs / guidelines；catch 异常写 reviewerErrors，不抛。"
```

## Task 3.6: critic 节点

**Files:**
- Create: `packages/ai/src/graph/nodes/critic.ts`
- Test: `packages/ai/src/graph/nodes/critic.test.ts`

- [ ] **Step 1: 实现**

`critic` 是 per-finding 节点，入参是 Send 派的 task：

```ts
// critic.ts
import type { AiAdapter } from "../../adapter.js";
import type { ReviewFinding } from "../../types.js";
import type { PerFindingState } from "../state.js";
import { getCtx } from "../ctx-cache.js";

export interface PerFindingTask {
  findingKey: string;
  finding: ReviewFinding;
  attempts: number;
  reviewRunId: string;
  contextRef: import("../state.js").ReviewContextRef;
}

export function makeCriticNode(adapter: AiAdapter) {
  return async function critic(
    task: PerFindingTask
  ): Promise<{ perFinding: Record<string, PerFindingState> }> {
    const ctx = getCtx(task.reviewRunId);
    if (!ctx) {
      // ctx 丢失：直接走 exhausted 兜底
      return {
        perFinding: {
          [task.findingKey]: {
            finding: task.finding, attempts: task.attempts,
            lastCritique: { valid: false, reason: "ctx-cache miss",
                            confidenceScore: 0 },
            status: "exhausted",
          },
        },
      };
    }

    const critique = await adapter.verifyFinding(task.finding, {
      ...task.contextRef,
      diffs: ctx.diffs,
      guidelines: ctx.guidelines,
      projectContext: ctx.projectContext,
    });

    let status: PerFindingState["status"] = "pending";
    let finding = task.finding;
    if (critique.valid) {
      status = "approved";
    } else if (task.attempts >= 1) {
      // 这是第 2 次（attempts=1），仍不过 → exhausted，用 patchedFinding 兜底
      status = "exhausted";
      if (critique.patchedFinding) finding = critique.patchedFinding;
    }
    // else: status stays pending → router 会派去 regenerator

    return {
      perFinding: {
        [task.findingKey]: {
          finding, attempts: task.attempts, lastCritique: critique, status,
        },
      },
    };
  };
}
```

- [ ] **Step 2: 写测试**

mock adapter 三种 critique 输出：valid / invalid+attempts<2 / invalid+attempts>=1。验三种 status。

- [ ] **Step 3: 跑测试 → PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/graph/nodes/critic.ts packages/ai/src/graph/nodes/critic.test.ts
git commit -m "feat: critic node updates perFinding status

调 adapter.verifyFinding；valid → approved；invalid+attempts<MAX → pending（router 后续派 regenerator）；invalid+attempts>=MAX → exhausted（用 patchedFinding 兜底）。"
```

## Task 3.7: regenerator 节点

**Files:**
- Create: `packages/ai/src/graph/nodes/regenerator.ts`
- Test: `packages/ai/src/graph/nodes/regenerator.test.ts`

- [ ] **Step 1: 实现**

```ts
// regenerator.ts
import type { AiAdapter } from "../../adapter.js";
import { getCtx } from "../ctx-cache.js";
import type { PerFindingTask } from "./critic.js";
import type { PerFindingState } from "../state.js";

export function makeRegeneratorNode(adapter: AiAdapter) {
  return async function regenerator(
    task: PerFindingTask
  ): Promise<{ perFinding: Record<string, PerFindingState> }> {
    const ctx = getCtx(task.reviewRunId);
    if (!ctx) {
      return {
        perFinding: {
          [task.findingKey]: {
            finding: task.finding, attempts: task.attempts + 1,
            lastCritique: null, status: "exhausted",
          },
        },
      };
    }

    // 注意：regenerator 拿的 critique 来自 critic 节点上一轮写入的 lastCritique；
    // 但 PerFindingTask 不传 critique（避免 task 体积膨胀）；通过 main state 二次派发拿。
    // 实施：在主图把 task 重新构造时把 lastCritique 一起塞进 task。见 Task 3.10 fanOutFromCritic。
    const critique = (task as any).lastCritique;
    if (!critique) throw new Error("regenerator: missing critique on task");

    const fixed = await adapter.regenerateFinding(task.finding, critique, {
      ...task.contextRef,
      diffs: ctx.diffs,
      guidelines: ctx.guidelines,
      projectContext: ctx.projectContext,
    });

    return {
      perFinding: {
        [task.findingKey]: {
          finding: fixed,
          attempts: task.attempts + 1,
          lastCritique: critique,
          status: "pending", // 派回 critic 再判
        },
      },
    };
  };
}
```

- [ ] **Step 2: 测试** — mock adapter，断言 attempts++、status=pending、finding 被替换为 fixed
- [ ] **Step 3: 跑测试 → PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/graph/nodes/regenerator.ts packages/ai/src/graph/nodes/regenerator.test.ts
git commit -m "feat: regenerator node revises a rejected finding

调 adapter.regenerateFinding；attempts++、status=pending（回到 critic）；ctx-cache miss 走 exhausted 兜底。"
```

## Task 3.8: collect_findings 节点

**Files:**
- Create: `packages/ai/src/graph/nodes/collect.ts`
- Test: `packages/ai/src/graph/nodes/collect.test.ts`

- [ ] **Step 1: 实现 + 测试**

```ts
// collect.ts
import type { ReviewGraphStateType, PerFindingState } from "../state.js";

export async function collectFindings(
  state: ReviewGraphStateType
): Promise<Partial<ReviewGraphStateType>> {
  const final = Object.values(state.perFinding)
    .filter((ps) => ps.status === "approved" || ps.status === "exhausted")
    .map((ps) =>
      ps.status === "exhausted" && ps.lastCritique?.patchedFinding
        ? ps.lastCritique.patchedFinding
        : ps.finding
    );
  return { finalFindings: final };
}
```

测试覆盖：approved、exhausted+patched、exhausted 无 patched 三种路径。

- [ ] **Step 2: 跑测试 → PASS**
- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/graph/nodes/collect.ts packages/ai/src/graph/nodes/collect.test.ts
git commit -m "feat: collect_findings merges approved + exhausted into finalFindings

exhausted 时若 critic 给了 patchedFinding 则用之兜底，否则保留原 finding。"
```

## Task 3.9: summarizer 节点

**Files:**
- Create: `packages/ai/src/graph/nodes/summarizer.ts`
- Test: `packages/ai/src/graph/nodes/summarizer.test.ts`

- [ ] **Step 1: 实现**

```ts
// summarizer.ts
import type { AiAdapter } from "../../adapter.js";
import type { ReviewGraphStateType } from "../state.js";
import { getCtx } from "../ctx-cache.js";

export function makeSummarizerNode(adapter: AiAdapter) {
  return async function summarizer(
    state: ReviewGraphStateType
  ): Promise<Partial<ReviewGraphStateType>> {
    const ctx = getCtx(state.reviewRunId);
    if (!ctx) return { summary: null };

    try {
      const { summary } = await adapter.generateReviewSummary({
        ...state.context,
        diffs: ctx.diffs,
        guidelines: ctx.guidelines,
        projectContext: ctx.projectContext,
        finalFindings: state.finalFindings,
      });
      return { summary };
    } catch {
      return { summary: null }; // 与现状 step 8c 行为一致
    }
  };
}
```

- [ ] **Step 2: 测试 success / failure 两路 → PASS**
- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/graph/nodes/summarizer.ts packages/ai/src/graph/nodes/summarizer.test.ts
git commit -m "feat: summarizer node reads finalFindings + diffs

调 adapter.generateReviewSummary；异常吞掉 summary=null（与 handler step 8c 现状一致）。"
```

## Task 3.10: router.ts（fanOutFindings + findingRouter + fanOutFromCritic）

**Files:**
- Create: `packages/ai/src/graph/router.ts`
- Test: `packages/ai/src/graph/router.test.ts`

- [ ] **Step 1: 实现**

```ts
// router.ts
import { Send } from "@langchain/langgraph";
import type { ReviewGraphStateType, PerFindingState } from "./state.js";
import type { PerFindingTask } from "./nodes/critic.js";

export const MAX_REFLECTION_ATTEMPTS = 2;

/** aggregator → 每条 pending finding 派一个 critic 子任务；空则直接到 summarizer。 */
export function fanOutFindings(state: ReviewGraphStateType) {
  const pending = Object.entries(state.perFinding).filter(
    ([_, ps]) => ps.status === "pending"
  );
  if (pending.length === 0) return "summarizer";

  return pending.map(
    ([key, ps]) =>
      new Send("critic", {
        findingKey: key,
        finding: ps.finding,
        attempts: ps.attempts,
        reviewRunId: state.reviewRunId,
        contextRef: state.context,
        lastCritique: ps.lastCritique,
      } satisfies PerFindingTask & { lastCritique: PerFindingState["lastCritique"] })
  );
}

/** critic 写完 perFinding 后：仍 pending → 派 regenerator；其他 → collect_findings。 */
export function fanOutFromCritic(state: ReviewGraphStateType) {
  const stillPending = Object.entries(state.perFinding).filter(
    ([_, ps]) => ps.status === "pending"
  );
  if (stillPending.length === 0) return "collect_findings";

  return stillPending.map(
    ([key, ps]) =>
      new Send("regenerator", {
        findingKey: key,
        finding: ps.finding,
        attempts: ps.attempts,
        reviewRunId: state.reviewRunId,
        contextRef: state.context,
        lastCritique: ps.lastCritique,
      })
  );
}

/** regenerator 写完 perFinding 后：把刚 attempts++ 的派回 critic。 */
export function fanOutFromRegenerator(state: ReviewGraphStateType) {
  const justRegenerated = Object.entries(state.perFinding).filter(
    ([_, ps]) => ps.status === "pending"
  );
  if (justRegenerated.length === 0) return "collect_findings";

  return justRegenerated.map(
    ([key, ps]) =>
      new Send("critic", {
        findingKey: key,
        finding: ps.finding,
        attempts: ps.attempts,
        reviewRunId: state.reviewRunId,
        contextRef: state.context,
        lastCritique: ps.lastCritique,
      })
  );
}
```

> **关键决定**：critic / regenerator 之间的循环不用 graph edge 而用主 state + 重复 fan-out。这样 perFinding 状态机集中在 critic 节点的 status 设定，router 只看 status 决定下一步派给谁。这避免了 LangGraph 子图的循环边复杂度。

- [ ] **Step 2: router 单测 — 覆盖所有分支**

```ts
// router.test.ts
describe("fanOutFindings", () => {
  it("returns 'summarizer' when no pending", () => { /* ... */ });
  it("returns Send[] of length=N for N pending findings", () => { /* ... */ });
});

describe("fanOutFromCritic", () => {
  it("→ regenerator for pending findings", () => { /* ... */ });
  it("→ collect_findings when none pending", () => { /* ... */ });
});

describe("MAX_REFLECTION_ATTEMPTS", () => {
  it("equals 2", () => assert.equal(MAX_REFLECTION_ATTEMPTS, 2));
});
```

- [ ] **Step 3: 跑测试 → PASS**
- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/graph/router.ts packages/ai/src/graph/router.test.ts
git commit -m "feat: router fans out per-finding via Send

fanOutFindings(aggregator→critic) / fanOutFromCritic(critic→regenerator|collect) / fanOutFromRegenerator(regenerator→critic)。MAX_REFLECTION_ATTEMPTS=2 在 router 决定。"
```

## Task 3.11: graph 组装 + buildReviewGraph 工厂

**Files:**
- Create: `packages/ai/src/graph/index.ts`

- [ ] **Step 1: 实现**

```ts
// index.ts
import { StateGraph, START, END, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { AiAdapter } from "../adapter.js";
import { ReviewGraphState } from "./state.js";
import { makeReviewerNode } from "./nodes/reviewer.js";
import { aggregator } from "./nodes/aggregator.js";
import { makeCriticNode } from "./nodes/critic.js";
import { makeRegeneratorNode } from "./nodes/regenerator.js";
import { collectFindings } from "./nodes/collect.js";
import { makeSummarizerNode } from "./nodes/summarizer.js";
import { fanOutFindings, fanOutFromCritic, fanOutFromRegenerator } from "./router.js";

export function buildReviewGraph(
  adapter: AiAdapter,
  checkpointer?: BaseCheckpointSaver
) {
  const graph = new StateGraph(ReviewGraphState)
    .addNode("quality_reviewer", makeReviewerNode("quality", adapter))
    .addNode("security_reviewer", makeReviewerNode("security", adapter))
    .addNode("aggregator", aggregator)
    .addNode("critic", makeCriticNode(adapter))
    .addNode("regenerator", makeRegeneratorNode(adapter))
    .addNode("collect_findings", collectFindings)
    .addNode("summarizer", makeSummarizerNode(adapter))
    .addEdge(START, "quality_reviewer")
    .addEdge(START, "security_reviewer")
    .addEdge("quality_reviewer", "aggregator")
    .addEdge("security_reviewer", "aggregator")
    .addConditionalEdges("aggregator", fanOutFindings, ["critic", "summarizer"])
    .addConditionalEdges("critic", fanOutFromCritic, ["regenerator", "collect_findings"])
    .addConditionalEdges("regenerator", fanOutFromRegenerator, ["critic", "collect_findings"])
    .addEdge("collect_findings", "summarizer")
    .addEdge("summarizer", END);

  return graph.compile({ checkpointer });
}

export type ReviewGraph = ReturnType<typeof buildReviewGraph>;
export { setCtx, getCtx, clearCtx } from "./ctx-cache.js";
export { ReviewGraphState } from "./state.js";
export type { PerFindingState, ReviewContextRef } from "./state.js";
```

- [ ] **Step 2: typecheck**

Run: `pnpm --dir packages/ai run typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/graph/index.ts
git commit -m "feat: buildReviewGraph factory composes all nodes + edges

quality+security 并行 → aggregator → fanOut(per finding) → critic ↔ regenerator → collect_findings → summarizer → END。checkpointer 可选注入。"
```

## Task 3.12: 端到端图测试（MemorySaver fixture）

**Files:**
- Create: `packages/ai/src/graph/graph.integration.test.ts`

- [ ] **Step 1: 写三个端到端 fixture**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { buildReviewGraph } from "./index.js";
import { setCtx, clearCtx } from "./ctx-cache.js";

const f = (overrides = {}) => ({
  filePath: "a.ts", startLine: 1, endLine: 1, side: "RIGHT" as const,
  issueType: "quality" as const, severity: "low" as const,
  title_en: "T", title_zh: "标", summary_en: "s", summary_zh: "总",
  suggestion_en: "g", suggestion_zh: "建", aiPrompt: "p", confidenceScore: 0.5,
  ...overrides,
});

const baseInitial = {
  reviewRunId: "rr-1",
  context: {
    fullName: "o/r", prNumber: 1, headSha: "h",
    organizationId: "o", repositoryId: "r", pullRequestId: "p",
    reviewRunId: "rr-1", providerConfigId: "pc",
  },
};

describe("review graph end-to-end (MemorySaver)", () => {
  it("Scenario A: all findings approved on first critic", async () => {
    setCtx("rr-1", { diffs: [], guidelines: "", projectContext: "" });
    const adapter = {
      generateReviewFindings: async (ctx: any) => ({
        findings: ctx.focus === "quality" ? [f({ title_en: "Q1" })] : [f({ title_en: "S1", issueType: "security" })],
      }),
      verifyFinding: async () => ({ valid: true, reason: "ok", confidenceScore: 0.9 }),
      regenerateFinding: async () => { throw new Error("should not be called"); },
      generateReviewSummary: async () => ({
        summary: { summaryMd_en: "ok", summaryMd_zh: "ok",
                   highlights_en: [], highlights_zh: [], mermaid_flow: "" },
      }),
    } as any;
    const graph = buildReviewGraph(adapter, new MemorySaver());
    const out = await graph.invoke(baseInitial, {
      configurable: { thread_id: "rr-1" },
    });
    assert.equal(out.finalFindings.length, 2);
    assert.ok(out.summary);
    clearCtx("rr-1");
  });

  it("Scenario B: 1 finding fixed on second critic", async () => {
    setCtx("rr-2", { diffs: [], guidelines: "", projectContext: "" });
    let verifyCount = 0;
    const adapter = {
      generateReviewFindings: async () => ({ findings: [f({ title_en: "X" })] }),
      verifyFinding: async () => {
        verifyCount++;
        return verifyCount === 1
          ? { valid: false, reason: "wrong line", confidenceScore: 0.6 }
          : { valid: true, reason: "ok", confidenceScore: 0.9 };
      },
      regenerateFinding: async (orig: any) => ({ ...orig, startLine: 5, endLine: 5 }),
      generateReviewSummary: async () => ({
        summary: { summaryMd_en: "", summaryMd_zh: "", highlights_en: [], highlights_zh: [], mermaid_flow: "" },
      }),
    } as any;
    const graph = buildReviewGraph(adapter, new MemorySaver());
    const out = await graph.invoke(
      { ...baseInitial, reviewRunId: "rr-2",
        context: { ...baseInitial.context, reviewRunId: "rr-2" } },
      { configurable: { thread_id: "rr-2" } }
    );
    // quality + security 都返回 X，aggregator 去重 → 1 条
    assert.equal(out.finalFindings.length, 1);
    assert.equal(out.finalFindings[0].startLine, 5); // regenerator 改过的版本
    clearCtx("rr-2");
  });

  it("Scenario C: exhaust attempts, fall back to patchedFinding", async () => {
    setCtx("rr-3", { diffs: [], guidelines: "", projectContext: "" });
    const adapter = {
      generateReviewFindings: async () => ({ findings: [f({ title_en: "X" })] }),
      verifyFinding: async (orig: any) => ({
        valid: false, reason: "still wrong", confidenceScore: 0.5,
        patchedFinding: { ...orig, title_en: "X-PATCHED" },
      }),
      regenerateFinding: async (orig: any) => orig, // 不变化
      generateReviewSummary: async () => ({
        summary: { summaryMd_en: "", summaryMd_zh: "", highlights_en: [], highlights_zh: [], mermaid_flow: "" },
      }),
    } as any;
    const graph = buildReviewGraph(adapter, new MemorySaver());
    const out = await graph.invoke(
      { ...baseInitial, reviewRunId: "rr-3",
        context: { ...baseInitial.context, reviewRunId: "rr-3" } },
      { configurable: { thread_id: "rr-3" } }
    );
    assert.equal(out.finalFindings.length, 1);
    assert.equal(out.finalFindings[0].title_en, "X-PATCHED");
    clearCtx("rr-3");
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm --dir packages/ai exec tsx --test src/graph/graph.integration.test.ts`
Expected: 3 个 scenario 全 PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/graph/graph.integration.test.ts
git commit -m "test: end-to-end graph fixtures with MemorySaver

3 个 scenario：全过 critic / 二次过 / 用尽兜底。"
```

## Task 3.13: PR-3 收尾

- [ ] Run `pnpm check`
- [ ] Push 分支

---

# PR-4: Handler 切流量 + Postgres checkpoint

**目标**：worker 启动 PostgresSaver、编译图；handler 步骤 8b/8c 切到 graph.invoke；通过 ENV 开关控制可一键回退。

## Task 4.1: worker 启 PostgresSaver 单例

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: 启动时 setup() + 注入 handler**

`apps/worker/src/index.ts` 在 `main()` 内 `await assertRedisReachable(...)` 之后加：

```ts
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { buildReviewGraph } from "@reviewer/ai";

// ...

const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL!);
await checkpointer.setup();
logger.info("LangGraph PostgresSaver ready");

// graph 在 handler 内部按 adapter 实例化（adapter 含 usageRecorder，不是 worker 单例）；
// checkpointer 通过 closure 传入。
const worker = new Worker(
  config.queueName,
  (job) => handleReviewJob(job, logger, checkpointer),
  { connection, concurrency: 2 }
);

// ...

// shutdown 时
const shutdown = async (signal: string) => {
  logger.info(`Shutting down on ${signal}`);
  await worker.close();
  await checkpointer.end();
  await connection.quit();
};
```

- [ ] **Step 2: typecheck**

Run: `pnpm --dir apps/worker run typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: worker bootstrap PostgresSaver singleton

启动时 PostgresSaver.setup() 自动建 checkpoint_* 三表；shutdown 时 checkpointer.end()。"
```

## Task 4.2: handler 切 graph.invoke

**Files:**
- Modify: `apps/worker/src/handlers/review.ts`

- [ ] **Step 1: 改 handler 签名 + 改 step 8b/8c**

`apps/worker/src/handlers/review.ts:50-56` 改签名：
```ts
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { buildReviewGraph, setCtx, clearCtx, type AiAdapter } from "@reviewer/ai";

export async function handleReviewJob(
  job: Job<WebhookJobPayload>,
  logger: Logger,
  checkpointer: BaseCheckpointSaver
): Promise<void> {
```

把第 130-187 行（step 8a-8c）替换为：

```ts
// 步骤 7b: 预填 ctx-cache
setCtx(runId!, { diffs, guidelines, projectContext });

try {
  // 步骤 8: getActiveAiProviderConfig（同现状 119-129 行）
  const activeConfig = await getActiveAiProviderConfig(organizationId);
  if (!activeConfig) throw new Error(`No active AI provider config for organization ${organizationId}`);
  const adapterConfig = {
    provider: activeConfig.provider, model: activeConfig.model,
    apiKey: activeConfig.apiKey, baseUrl: activeConfig.baseUrl ?? undefined,
  };

  const usageRecorder: UsageRecorder = async (draft) => {
    await insertUsageEvent({ ...draft, agentRole: draft.agentRole, attemptNumber: draft.attemptNumber });
  };

  const adapter = createAdapter(adapterConfig, usageRecorder);

  // 步骤 8a: 编译图
  const graph = buildReviewGraph(adapter, checkpointer);

  const reviewContextRef = {
    fullName: repo.full_name, prNumber, headSha,
    organizationId, repositoryId, pullRequestId,
    reviewRunId: runId!, providerConfigId: activeConfig.id,
  };

  // 步骤 8b: 续跑判断 + invoke
  const config = {
    configurable: {
      thread_id: runId!,
      checkpoint_ns: "review_v1",
    },
  };
  const existing = await checkpointer.getTuple(config);
  const result = existing?.checkpoint?.v
    ? await graph.invoke(null, config)
    : await graph.invoke(
        { reviewRunId: runId!, context: reviewContextRef },
        config
      );

  // 步骤 8c: 取出图输出
  const finalFindings = result.finalFindings ?? [];
  const summaryMd = result.summary ? renderBilingualSummary(result.summary) : null;

  // 步骤 9-13 不变（用 finalFindings 替换原来的 result.findings）
  const issueInputs = finalFindings.map((f) => ({
    /* ... 现有 fingerprint 逻辑不变 ... */
  }));
  const insertedIssues = await insertReviewIssues(issueInputs);

  // ... 原 step 10/11/12/13 不动 ...
} finally {
  clearCtx(runId!);
}
```

- [ ] **Step 2: 改 worker index 调用 handler 签名**（已在 Task 4.1）

- [ ] **Step 3: typecheck + 跑现有 handler 集成测试**

Run: `pnpm --dir apps/worker run typecheck && pnpm --dir apps/worker run test`
Expected: 0 errors（现有测试若 mock 了 generateReviewFindings 直接调用，可能需要更新 mock 调 graph 路径——按需修复）

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/handlers/review.ts apps/worker/src/index.ts
git commit -m "feat: handler step 8b/8c switched to LangGraph

handleReviewJob 接收 checkpointer 参数；ctx-cache setCtx/clearCtx 包住 graph.invoke；用 graph.invoke(null) 续跑已有 checkpoint，否则首跑。step 9-13 沿用 finalFindings + summary。"
```

## Task 4.3: 手动 staging 验证

- [ ] **Step 1: 起本地 worker**

Run: `pnpm --dir apps/worker run dev`
Expected: 日志含 "LangGraph PostgresSaver ready"

- [ ] **Step 2: 验三张 checkpoint 表存在**

Run: `psql $DATABASE_URL -c "\dt" | grep checkpoint`
Expected: `checkpoints` / `checkpoint_blobs` / `checkpoint_writes` 全在

- [ ] **Step 3: 在 staging GitHub 仓库推一个 PR 触发 webhook**

观察：
- review_run 表 `graph_thread_id` 字段被写入
- `usage_events` 表多条记录，`agent_role` 包含 quality / security / critic / summarizer
- 最终 `review_issues` 数量 ≤ draftFindings 总数（critic 过滤生效）

- [ ] **Step 4: kill -9 worker 重启验证 checkpoint 续跑**

时机：在 critic 阶段（usage_events 已有 quality/security 记录、还没 critic 记录的瞬间）`kill -9`。重启后看：
- usage_events 中 quality/security 记录**不重复**
- 日志显示从 critic 节点开始执行

如果不通过，回退到 master 排查。

## Task 4.4: 回退开关（防御性，可选）

**Files:**
- Modify: `apps/worker/src/handlers/review.ts`

- [ ] **Step 1: 加 ENV 开关**

```ts
const REVIEW_GRAPH_ENABLED = process.env.REVIEW_GRAPH_ENABLED !== "0";

if (REVIEW_GRAPH_ENABLED) {
  // 新逻辑（Task 4.2）
} else {
  // 旧逻辑：直接调 generateReviewFindings + generateReviewSummary（保留代码到 PR-5 删除）
}
```

> 部署时默认开启；如线上出问题，运维只需 `REVIEW_GRAPH_ENABLED=0` 重启 worker 即可瞬间回退。

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: REVIEW_GRAPH_ENABLED env switch for rollback

默认 ON；运维通过设 0 + 重启 worker 一键回退到旧 generateReviewFindings 流程。"
```

## Task 4.5: PR-4 收尾

- [ ] `pnpm check` 全绿
- [ ] Push 分支

---

# PR-5: 清理 + 文档

**目标**：移除老路径 + 写文档。

## Task 5.1: 移除 REVIEW_GRAPH_ENABLED 开关 + 老的直接调用代码

**Files:**
- Modify: `apps/worker/src/handlers/review.ts`

- [ ] **Step 1: 删 ENV 分支 + 旧 generateReviewFindings/Summary 调用**

只保留新流程。删除 `if (REVIEW_GRAPH_ENABLED)` else 分支。

- [ ] **Step 2: typecheck + test**

Run: `pnpm check`

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove REVIEW_GRAPH_ENABLED rollback switch

新流程稳定运行后清理。"
```

## Task 5.2: 更新 pattern.md 写明新拓扑

**Files:**
- Modify: `pattern.md`

- [ ] **Step 1: 加节"AI Review Pipeline (LangGraph)"**

涵盖：
- 主图节点列表
- per-finding 反思循环规则（MAX=2 + 兜底 patchedFinding）
- agent_role 枚举
- checkpoint 表巡检建议（"建议每月跑 SELECT pg_size_pretty(pg_total_relation_size('checkpoints')); 监控大小，必要时 cron 清理 30 天前已 succeeded/failed 的 thread"）
- 图与 BullMQ 的分工

- [ ] **Step 2: Commit**

```bash
git add pattern.md
git commit -m "docs: pattern.md adds LangGraph review pipeline section

记录主图节点拓扑、反思循环规则、agent_role 枚举、checkpoint 巡检建议。"
```

## Task 5.3: PR-5 收尾 + 整体 PR review 准备

- [ ] `pnpm check` 全绿
- [ ] Push
- [ ] 在 GitHub 开 PR：标题 "feat: LangGraph multi-agent review pipeline / 多 agent 评审管线"，body 引用 design doc + 5 个分阶段提交清单
- [ ] 等待 review

---

# 实施总览（任务依赖图）

```
Task 1.1 (0006 migration)
   └→ 1.3 (AiTaskType + UsageContext)
        └→ 1.4 (insertUsageEvent SQL + handler recorder)
              └→ 1.6 ✓ PR-1 done
Task 1.2 (0007 migration)
   └→ 1.5 (createReviewRun graph_thread_id) ─→ 1.6

Task 2.1 (focus)
Task 2.2 (verifyFinding)        — 互不依赖，可并行
Task 2.3 (regenerateFinding)
Task 2.4 (summary finalFindings)
   └→ 2.5 ✓ PR-2 done

Task 3.1 (装 langgraph)
   └→ 3.2 (ctx-cache)
        └→ 3.3 (state)
              └→ 3.4 / 3.5 / 3.6 / 3.7 / 3.8 / 3.9（节点，可并行）
                    └→ 3.10 (router)
                          └→ 3.11 (graph index)
                                └→ 3.12 (E2E test)
                                      └→ 3.13 ✓ PR-3 done

Task 4.1 (PostgresSaver)
   └→ 4.2 (handler 切流量)
        └→ 4.3 (staging 验证)
              └→ 4.4 (回退开关)
                    └→ 4.5 ✓ PR-4 done

Task 5.1 / 5.2 → 5.3 ✓ PR-5 done
```

---

# 验证清单（end-to-end）

- [ ] PR-1：DB 迁移跑通；`pnpm check` 全绿；线上 worker 用旧逻辑也能跑（向下兼容验证）
- [ ] PR-2：`packages/ai/src/adapter*.test.ts` 全 PASS；handler 暂未调用新方法不影响线上
- [ ] PR-3：`packages/ai/src/graph/**/*.test.ts` 全 PASS；`graph.integration.test.ts` 三个 scenario 全 PASS
- [ ] PR-4：staging 推 PR 触发 webhook；review_run.graph_thread_id 写入；usage_events 出现多 agent_role；`kill -9` worker 重启后从 checkpoint 续跑且不重复跑 reviewer
- [ ] PR-5：`pattern.md` 含图拓扑；线上观察 1 周指标：critic 通过率 (attempt=0 vs 1) / review_runs 失败率 / 平均 token 消耗

---

# 不在范围内（明确不做）

- ❌ agent ↔ model 多对多配置（`ai_provider_configs` schema 不动）
- ❌ replay UI / time-travel 调试接口
- ❌ checkpoint 清理 cron（pattern.md 提建议即可）
- ❌ LangSmith 接入
- ❌ RAG retrieval step
- ❌ 监控 / 告警自动化
