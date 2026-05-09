# PR 总评升级：双语 + 项目背景注入 + 流程图

**日期**：2026-04-29
**分支**：`feat/pr-comments`
**状态**：设计已确认，待实现

## 上下文 / Context

当前 `generateReviewSummary` 输出单语英文 summary + highlights，存在以下不足：

1. 中文用户阅读体验差：summary 全英文，国内 PR 协作场景不友好。
2. 缺乏项目背景：AI 没看过 reviewer 自己的 review 风格规范，也没看过被 review 仓库自己的项目说明，只能基于 diff 文本 + system prompt 通用经验来评，准确度受限。
3. PR 改动若涉及调用链/状态流转，文字描述不直观。

升级目标：

- AI 输出**英文 + 中文**两份等价但各自地道的 summary 和 highlights
- 在 prompt 里注入「reviewer 自身规范」+「目标仓库背景」两块项目知识
- 当 PR diff 引入或修改清晰执行链路时，AI 用 mermaid 输出流程图；否则不输出

## 范围 / Scope

**In**

- 修改 `generateReviewSummary`（`packages/ai/src/adapter.ts` 两个 adapter：Anthropic + OpenAI-compat）
- 新增项目背景加载模块（reviewer 本仓库 doc + 目标仓库 doc）
- Provider 接口扩展：`getRepositoryFile`（GitHub + Gitee 两个实现）
- Worker 端 `summaryMd` 拼装升级（`apps/worker/src/handlers/review.ts`）
- 契约测试更新：`packages/ai/src/review.test.mjs`
- 新模块单测：背景加载、白名单、4000 字截断、LRU 缓存

**Out (YAGNI)**

- 不改行内评论 prompt（只升级总评）
- 不加语言切换 / 单语输出开关
- 不改 GitLab provider（当前生产路径不走 GitLab）
- 不做磁盘/Redis 持久化缓存（进程内 LRU 即可）
- 不做 doc 内容 token 切片（按字符数硬截断）

## 设计 / Design

### 1. Tool schema 改造

`report_summary` 输入从：

```ts
{ summaryMd: string; highlights: string[] }
```

升级为：

```ts
{
  summaryMd_en: string;     // required, non-empty
  summaryMd_zh: string;     // required, non-empty
  highlights_en: string[];  // required, may be empty
  highlights_zh: string[];  // required, may be empty
  mermaid_flow: string;     // required, "" means no flow
}
```

`required` 包含全部 5 个字段。「无流程」用空字符串而非 optional，schema 更稳定，AI 出错率更低。

`ReviewSummary` 类型同步升级（`packages/ai/src/types.ts`）：

```ts
export interface ReviewSummary {
  summaryMd_en: string;
  summaryMd_zh: string;
  highlights_en: string[];
  highlights_zh: string[];
  mermaid_flow: string;
}
```

### 2. 项目背景加载模块

**位置**：`packages/ai/src/context.ts`（新建）

**白名单文件**（每个仓库各 4 个，根级）：

1. `CLAUDE.md`
2. `AGENTS.md`
3. `pattern.md`
4. `README.md`

**截断规则**：每个文件超过 4000 字符截断，末尾追加 `\n\n[...truncated]`。

#### 2.1 reviewer 自身规范

```ts
loadReviewerGuidelines(): Promise<string>
```

- 从 `process.cwd()` 同名文件读取（同步 fs，因为是本地磁盘）
- 进程级 lazy load + 模块作用域缓存（重启即重读）
- 缺文件跳过、不报错
- 返回拼装文本：

```
# CLAUDE.md
{...}

# AGENTS.md
{...}

# pattern.md
{...}

# README.md
{...}
```

全 4 个都缺时返回空字符串。

#### 2.2 目标仓库背景

```ts
loadTargetRepoContext(
  provider: IProvider,
  fullName: string,
  ref: string,                 // headSha
  credential: ProviderCredential,
  logger: Logger
): Promise<string>
```

- 4 个文件**并发**调 `provider.getRepositoryFile`
- 任一失败/404：warn 后返回 null，不抛
- 同样按 4000 字截断、按上面格式拼装
- 全空返回空串

#### 2.3 LRU 缓存（仅目标仓库）

- key: `${provider}:${fullName}:${ref}:${path}`
- value: `string | null`（null 表示已知不存在，避免反复 404）
- 容量：256 entries，先到先驱逐
- 无 TTL：key 含 head_sha，天然不会脏
- 实现：自写 ~30 行 LRU 或引入 `lru-cache`（项目已有则复用，否则手写）

### 3. Provider 接口扩展

#### 3.1 接口

`packages/git/src/provider.ts`：

```ts
interface IProvider {
  // ...existing...
  getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: Logger
  ): Promise<string | null>;
}
```

返回文件内容（utf-8）；404 / 路径不存在 → 返回 null（**不抛**）；其他错误（401/403/5xx）→ throw，由调用方决定是否吞。

#### 3.2 GitHub 实现

```
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}
```

响应 `content` 是 base64，需 `Buffer.from(content, 'base64').toString('utf-8')`。

#### 3.3 Gitee 实现

```
GET https://gitee.com/api/v5/repos/{owner}/{repo}/contents/{path}?ref={ref}&access_token={token}
```

响应同样 base64。

### 4. Prompt 升级

**System prompt**（`adapter.ts:177-178`）追加：

```
You produce both English and Chinese (Simplified) outputs that are independently idiomatic — not literal translations. When the diff introduces or alters a clear execution flow / call chain / state transition, output a mermaid diagram; otherwise leave the flow field empty.
```

**User message** 模板（`buildSummaryUserMessage`）升级为：

```
You are summarizing pull request #{prNumber} in repository {fullName} (head SHA: {headSha}).

<reviewer_guidelines>
{reviewer 仓库 4 文件拼装, 可能为空}
</reviewer_guidelines>

<project_context>
{目标仓库 4 文件拼装, 可能为空}
</project_context>

<diff>
{diffText}
</diff>

Call the `report_summary` tool with:

- `summaryMd_en`: a concise English Markdown overview (3–8 sentences) of what this PR changes and why. Reference file/module names where useful. Do not invent functionality not in the diff.
- `summaryMd_zh`: 等价的中文 Markdown 概述（3-8 句），独立成文，不要逐字翻译英文版本。
- `highlights_en`: 2–6 short bullet strings naming the most important changes, risks, or things to double-check.
- `highlights_zh`: 2-6 条对应中文要点，独立成文。
- `mermaid_flow`: if and only if the diff introduces or modifies a discernible execution flow, call chain, or state transition, output a mermaid block (e.g. ```mermaid sequenceDiagram ...```). Otherwise output an empty string.
```

> 空 `<reviewer_guidelines>` 或 `<project_context>` 块仍保留 tag，让 AI 知道"看过没找到"，而不是"忘了注入"。

### 5. Worker 拼装

`apps/worker/src/handlers/review.ts:127-133` 改为：

```ts
const summary = await generateReviewSummary(reviewContext, adapterConfig);
summaryMd = renderBilingualSummary(summary);
```

新函数 `renderBilingualSummary(summary)`（worker 内或 `@reviewer/ai` 暴露）：

```
## Summary
{summaryMd_en}

**Highlights:**
- ...

---

## 摘要
{summaryMd_zh}

**关键变更:**
- ...

(可选) ---

## Flow / 流程

```mermaid
{mermaid_flow}
```
```

排版顺序：**英文 → 中文 → mermaid**。

省略规则：
- `mermaid_flow === ""` → 整段（heading + 代码块）省略，连带前面的 `---` 分隔线
- `highlights_en` 为空 → 省略 `**Highlights:**` 整块（heading + list）
- `highlights_zh` 为空 → 省略 `**关键变更:**` 整块
- `summaryMd_en` 或 `summaryMd_zh` 不会为空（schema required + non-empty 校验）

### 6. 项目背景注入接入点

`apps/worker/src/handlers/review.ts` 步骤 8 拉到 `diffs` 之后、调 AI 之前，新增：

```ts
const [guidelines, projectContext] = await Promise.all([
  loadReviewerGuidelines(),
  loadTargetRepoContext(provider, repo.full_name, headSha, credential, logger),
]);

const reviewContext = {
  fullName: repo.full_name,
  prNumber,
  headSha,
  diffs,
  guidelines,        // 新增
  projectContext,    // 新增
};
```

`ReviewContext` 类型（`packages/ai/src/types.ts`）扩展两个可选字段，向后兼容。adapter 在拼 user message 时注入。

### 7. 失败处理

保持现有「summary 失败不阻塞行内评论」语义：

| 场景 | 行为 |
|---|---|
| reviewer doc 加载失败（fs 错误） | warn，guidelines 取空串 |
| 目标仓库 doc 拉取 404 | 静默跳过，缓存 null |
| 目标仓库 doc 拉取 5xx/网络 | warn，该文件取空串，**不抛**（不阻塞 summary） |
| AI 调用失败 | 现有逻辑：warn，summaryMd 设 null，行内评论继续 |
| AI 返回 schema 缺字段 | 抛错（adapter 层），由 summary try/catch 兜底 |
| `mermaid_flow` 字段缺失 | 当作空串处理，不报错 |

### 8. 测试

#### 8.1 `packages/ai/src/review.test.mjs` 更新

钉死契约：

- 新 5 字段 schema：`summaryMd_en` / `summaryMd_zh` / `highlights_en` / `highlights_zh` / `mermaid_flow` 全 required
- Anthropic + OpenAI-compat 都返回新 schema
- `mermaid_flow=""` 时 worker 拼装跳过 mermaid 块
- `mermaid_flow="```mermaid ...```"` 时拼到末尾
- OpenAI-compat content JSON fallback 路径同样按新 schema 解析
- AI 缺任一 required 字段 → adapter 抛
- highlights 数组为空合法

#### 8.2 新增测试

- `packages/ai/src/context.test.mjs`（或 .test.ts）：
  - reviewer doc：4 文件存在/缺失/超长截断/缓存命中
  - target doc：mock provider，4 文件并发拉、404 跳过、5xx warn 不抛、缓存命中（同 sha 第二次调用不调 provider）
  - LRU 容量驱逐

#### 8.3 worker 渲染测试

- `apps/worker/src/handlers/review.test.ts`（如已有则扩，没有则新建）：
  - `renderBilingualSummary` 排版顺序、空 mermaid 跳过、空 highlights 处理

### 9. 兼容 / 迁移

`ReviewSummary` 是产物，不存 DB schema，所以：

- DB 存的 `summaryMd` 字段是拼装后的字符串，schema 不变。
- 未来任何调 `generateReviewSummary` 的代码必须用新 schema。
- 现有契约测试需要全部更新（不保留旧字段路径）。

不需要 feature flag——本仓库一次切换即可。

## 关键文件 / Critical Files

- `packages/ai/src/adapter.ts` —— tool schema、prompt、validate
- `packages/ai/src/types.ts` —— `ReviewSummary` / `ReviewContext`
- `packages/ai/src/context.ts` —— **新建**，doc 加载 + LRU
- `packages/ai/src/review.test.mjs` —— 契约测试
- `packages/ai/src/context.test.mjs` —— **新建**
- `packages/git/src/provider.ts` —— 接口
- `packages/git/src/github/provider.ts` —— GitHub `getRepositoryFile`
- `packages/git/src/gitee/provider.ts` —— Gitee `getRepositoryFile`
- `apps/worker/src/handlers/review.ts` —— 接入背景加载 + 双语拼装

## 验证 / Verification

- `pnpm -r --if-present test` —— `@reviewer/ai` 全绿（含新 context 测试）
- 本地 worker 实跑：用真实 GitHub PR 触发 review
  - 验证 PR conversation 评论里有英文 + 中文两段 + Highlights，diff 含调用链时有 mermaid 块
  - 验证目标仓库 doc 命中（看 `worker` 日志 `Loaded project context`-类信息）
  - 验证目标仓库无相关 doc 时不报错
- 阿里 Qwen3 thinking 模型回归：双语生成稳定，schema 不丢字段
- 标准 OpenAI 模型回归：tool_calls 主路径仍 OK
- 缓存：同一 PR 触发两次 review，第二次不应再调目标仓库 contents API（看日志）

## 不在范围 / Out of Scope

- 不改行内评论的 prompt 和 schema
- 不加单语切换开关 / 不存用户偏好
- 不引入 Redis / 跨进程缓存
- 不在 doc 加载里做 token 级切片（按字符截断）
- 不改 GitLab provider 实现（接口加，实现可留 TODO 抛 `NotImplemented`，避免 GitLab 路径调用时静默错误）
