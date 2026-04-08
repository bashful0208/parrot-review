# AI Provider 后台配置设计

**日期:** 2026-04-08  
**范围:** Phase 4.3 — Provider 支持完整接入  
**状态:** 已批准

---

## 目标

将 `ANTHROPIC_API_KEY` 等 AI provider 配置从环境变量迁移到后台管理界面，支持 Anthropic、OpenAI、Alibaba/Qwen 及自定义 OpenAI-compatible 中转站，API Key 存储于数据库 `metadata` 字段（P0 明文，后续迁移加密，见 TODO）。

---

## 1. 数据库迁移

文件：`postgres/migrations/0004_ai_provider_config_p0.sql`

变更点：
- `ai_provider_configs.vault_secret_id` 改为 `nullable`（P0 不接 vault）
- `ai_provider` enum 新增 `'custom'`（覆盖自定义中转站场景）

API Key 存储在已有的 `metadata jsonb` 字段：

```json
{ "api_key": "sk-ant-xxx" }
```

> **TODO(security):** P0 明文存储，后续统一迁移到 vault 或 pgcrypto 列加密。所有读写路径集中在 `packages/core/src/repositories/ai-provider-config.ts`，届时只改一处。

`base_url` 字段已存在，留空表示使用各 provider 官方默认地址。

---

## 2. `packages/ai` 抽象层重构

### 2.1 Adapter 接口

```ts
interface AiAdapter {
  generateReviewFindings(context: ReviewContext): Promise<ReviewResult>;
}
```

### 2.2 两个实现

| Adapter | 覆盖 provider | 依赖 |
|---|---|---|
| `AnthropicAdapter` | `anthropic` | `@anthropic-ai/sdk` |
| `OpenAICompatibleAdapter` | `openai` / `alibaba` / `custom` | `openai` SDK |

`OpenAICompatibleAdapter` 接收 `baseUrl` 参数：
- `openai`：不传，使用默认
- `alibaba`：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- `custom`：用户填写的 URL

### 2.3 工厂函数

```ts
// packages/ai/src/adapter.ts
export function createAdapter(config: AiAdapterConfig): AiAdapter
```

`AiAdapterConfig`：

```ts
type AiAdapterConfig = {
  provider: 'anthropic' | 'openai' | 'alibaba' | 'custom';
  model: string;
  apiKey: string;
  baseUrl?: string;  // custom / alibaba 必填
};
```

### 2.4 `generateReviewFindings` 改造

签名变更：去掉单独的 `apiKey` 参数，改为接收 `AiAdapterConfig`：

```ts
// 旧
generateReviewFindings(context, config, apiKey)

// 新
generateReviewFindings(context, adapterConfig)
```

内部调用 `createAdapter(adapterConfig).generateReviewFindings(context)`。

---

## 3. `packages/core` — CRUD

文件：`packages/core/src/repositories/ai-provider-config.ts`

导出函数：

| 函数 | 说明 |
|---|---|
| `createAiProviderConfig(orgId, input)` | 新增配置，写入 metadata.api_key |
| `listAiProviderConfigs(orgId)` | 列出该 org 所有配置，api_key 做 mask 处理后返回 |
| `getActiveAiProviderConfig(orgId)` | 返回 `is_active=true` 的配置含明文 key（worker 专用） |
| `setActiveAiProviderConfig(orgId, configId)` | 事务内：先全部置 false，再置目标为 true |
| `deleteAiProviderConfig(id, orgId)` | 带 orgId 校验，不允许删除激活中的配置 |

`masked_key_suffix` 字段在写入时自动截取 key 末 4 位存储，供前端展示。

---

## 4. Worker 改造

**文件：** `apps/worker/src/handlers/review.ts`

替换：

```ts
// 删除
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const aiConfig = loadAiProviderConfig();

// 改为
const providerConfig = await getActiveAiProviderConfig(organizationId);
if (!providerConfig) {
  throw new Error(`No active AI provider config for org ${organizationId}`);
}
```

`generateReviewFindings` 调用改为传 `providerConfig`（包含 provider、model、apiKey、baseUrl）。

`ANTHROPIC_API_KEY` 从 `workerEnvSchema` 移除（不再必填）。`DEFAULT_MODEL_PROVIDER` / `DEFAULT_MODEL_NAME` 也从启动校验移除。

---

## 5. Web UI

### 5.1 路由

新增页面：`apps/web/src/app/settings/providers/page.tsx`

侧边栏 `settings` 入口已存在，指向 `/settings`，新建 `/settings/providers` 作为 providers 子页面，侧边栏直接链到此页。

### 5.2 API Routes

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/api/providers` | 列出配置（masked key） |
| `POST` | `/api/providers` | 新增配置 |
| `PATCH` | `/api/providers/[id]/activate` | 切换激活 |
| `DELETE` | `/api/providers/[id]` | 删除 |

### 5.3 页面结构

**列表区：** 每行显示 provider badge、display name、model、masked key、激活状态 badge、操作按钮（激活/删除）。

**添加 Dialog（shadcn `Dialog`）：**

1. 选择 provider 类型（`Select`）：Anthropic / OpenAI / Alibaba/Qwen / 自定义
2. 动态表单：
   - 所有类型：Display Name（文本）、API Key（密码框）、Model（文本）
   - 仅 `custom`：额外显示 Base URL 输入框
   - `alibaba` 的 Base URL 前端自动填充 dashscope 地址（可手动覆盖）
3. 提交后刷新列表

**约束：**
- 删除激活中的配置需弹二次确认
- 同一时刻只能有一个激活配置（后端保证，前端在切换时乐观更新）

---

## 6. 不在本次范围内

- 仓库级 provider 覆盖（`ai_provider_bindings`）
- Fallback provider
- provider 切换时的 token 计量与审计
- vault 加密（已记录 TODO）
- 重试任务队列

---

## 数据流（测试路径）

```
GitHub webhook
  → POST /api/webhooks/github
  → enqueueWebhookJob
  → Worker: getActiveAiProviderConfig(orgId)   ← 从 DB 读
  → createAdapter(config)
  → adapter.generateReviewFindings(context)
  → insertReviewIssues / postReviewComment
```
