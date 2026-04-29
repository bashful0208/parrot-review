# OpenAI 兼容 Adapter 的 `tool_choice` 兼容性修复

## 背景

当前 `OpenAICompatibleAdapter`（`packages/ai/src/adapter.ts`）在两个方法里都用了 object 形式的 `tool_choice`：

```ts
tool_choice: { type: "function", function: { name: "report_findings" } }
tool_choice: { type: "function", function: { name: "report_summary" } }
```

阿里 DashScope 在 thinking 模式（如 Qwen3 thinking 模型）下会拒绝 object / `required` 形式的 `tool_choice`，只接受 `auto`。Worker 在 webhook 触发 review 时会直接 400：

```
InternalError.Algo.InvalidParameter: The tool_choice parameter does not support
being set to required or object in thinking mode
```

## 目标

让同一份 `OpenAICompatibleAdapter` 同时兼容：

- 标准 OpenAI（GPT-4 等）
- 阿里 DashScope 的 thinking 模型（Qwen3 thinking）
- 阿里 DashScope 的非 thinking 模型

不引入新配置项、不区分 provider 分支。

## 非目标

- 不动 `AnthropicAdapter`
- 不动 `config.ts` / `AiAdapterConfig` / env 变量
- 不重构调用方
- 不引入 OpenRouter / 其他自定义 provider 适配（CLAUDE.md 范围只到 OpenAI + 阿里）

## 设计

### 1. `tool_choice` 改为 `"auto"`

两处对称改动（`generateReviewFindings` 行 373、`generateReviewSummary` 行 437）：

```ts
tool_choice: "auto"
```

理由：单工具 + 强 system prompt 约束下，主流模型几乎一定会调用工具；不调用工具时由下面的 fallback 兜底。

### 2. 结果解析加 fallback

两个方法的解析路径统一为：

1. 优先：`choice.message.tool_calls[0]`，且 `tool_calls[0].type === "function"` 且 `function.name` 匹配预期工具名 → 用 `function.arguments` 走原路径 `JSON.parse` + `validateAndNormalize*`。
2. 兜底：没有匹配的 tool_call 时，从 `choice.message.content` 文本中提取 JSON：
   - 先尝试整段 `JSON.parse`
   - 失败：匹配 ` ```json ... ``` ` 或 ` ``` ... ``` ` 代码块，取第一个块 `JSON.parse`
   - 再失败：定位第一个 `{` 到最后一个 `}` 之间的子串，`JSON.parse` 校验
   - 任一成功 → 走原 `validateAndNormalize*`
3. 都失败 → 抛 `OpenAI-compatible API did not return expected ... for report_findings/report_summary`（保留现有错误文案，避免上层映射器破坏）

### 3. 提取 JSON 的实现

抽成模块内 helper：

```ts
function extractJsonFromText(text: string | null | undefined): unknown | undefined
```

- 输入空 → `undefined`
- 三步策略，任何一步成功立即返回
- 不抛错，永远返回 `unknown | undefined`

两个方法各自调用一次。

### 4. 错误处理

- API 调用本身的错误：保持原 try/catch 包装（`OpenAI-compatible API ... call failed: ...`）
- finish_reason === "length"：保持原行为（抛 truncated）
- 解析失败：保持原文案，便于错误映射器（`mapModelInvocationError`）继续工作

### 5. 测试

`packages/ai/src/review.test.mjs` 增加 fallback case，覆盖矩阵：

- `generateReviewFindings` × `content` 是裸 JSON → 拿到 findings
- `generateReviewFindings` × `content` 是 ```` ```json ... ``` ```` 包裹 → 拿到 findings
- `generateReviewSummary` × `content` 是裸 JSON → 拿到 summary
- 任一方法 × 既无 tool_call 又无可解析 JSON → 抛 `did not return expected ...` 错误

mock 通过 `tool_calls: undefined` + 设置 `message.content` 模拟。

## 文件影响

- `packages/ai/src/adapter.ts` —— 主改动
- `packages/ai/src/review.test.mjs` —— 加测试 case

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 模型既不调用工具又返回非 JSON 文本 | fallback 三策略覆盖常见格式；最终抛错让上层重试或失败 |
| `validateAndNormalize*` 对 fallback 解析的对象 schema 不容忍 | 现有校验函数已在 tool_call 路径用过，schema 一致 |
| 阿里 thinking 模式下 content 可能被拆成 reasoning + content 两段 | 兜底只看 `message.content`；如未来发现 reasoning 字段也带 JSON，再扩展 |

## 验收

- worker 接到阿里 thinking 模型返回 200，跑通 review 流程
- 标准 OpenAI 模型行为不变（仍走 tool_call 路径）
- `pnpm test`（review.test.mjs）通过
