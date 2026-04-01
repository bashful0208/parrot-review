# Phase 1 多租户与核心数据模型设计

> 目标：按 `doc/p0-development-progress.md` Phase 1 清单补齐现有 `postgres/migrations/0001_p0_schema.sql`，不引入增量迁移或 ORM 重构。

## 范围

- 只完成 `Phase 1 多租户与核心数据模型`
- 以 `doc/p0-development-progress.md` 为唯一验收标准
- 直接修改 `postgres/migrations/0001_p0_schema.sql`（不新增迁移文件）
- 补齐 `packages/db-types/src/index.ts` 的类型导出
- 不进入 `1.5 安全与权限控制`（RLS 等后续工作）
- 不改写 API / UI / Worker 业务接线

## 变更内容

### 1. memberships 表

- 新增字段：`join_source text null`
- 用途：记录成员加入来源，如邀请、直接加入等
- 更新注释：新增 `join_source` 字段说明

### 2. repositories 表

- 新增字段：`provider_owner_namespace text null`
- 用途：记录平台侧 owner namespace
- 更新注释：新增 `provider_owner_namespace` 字段说明

### 3. repo_integrations 表

- 新增字段：
  - `last_health_check_at timestamptz null`
  - `last_health_check_result text null`
  - `last_synced_at timestamptz null`
- 用途：记录健康检查与同步状态
- 更新注释：补齐健康检查与同步相关字段说明

### 4. pull_requests 表

- 唯一约束修改：从 `(repository_id, provider_pr_number)` 改为 `(repository_id, provider_pr_id)`
- 原因：`doc/p0-development-progress` 清单要求使用 `provider_pr_id` 作为唯一约束
- 更新注释：无需特殊调整（原注释已准确）

### 5. pr_commits 表

- 新增字段：`message_summary text null`
- 用途：保存 commit message 摘要
- 更新注释：新增 `message_summary` 字段说明

### 6. review_runs 表

- 新增字段：
  - `task_source text null`
  - `retry_count integer not null default 0 check (retry_count >= 0)`
- 用途：记录任务来源与重试次数
- 更新注释：补齐 `task_source`、`retry_count` 字段说明

### 7. packages/db-types 导出

- 新增导出：Phase 1 所有枚举类型的 TypeScript 类型定义
  - `GitProvider`
  - `MemberRole`
  - `RepoStatus`
  - `ReviewMode`
  - `OutputLanguage`
  - `ReviewRunStatus`
  - `ReviewTrigger`
  - `IssueType`
  - `Severity`
  - `IssueStatus`
  - `CommentStatus`
  - `FeedbackType`
  - `AiProvider`
  - `AiTaskType`
  - `RuleSourceType`

## 设计原则

- 以现有 schema 为基础，只做补齐和校正，不做大幅重构
- 保持与清单一致，优先满足验收标准
- 类型定义与数据库枚举保持一致
- 注释补充中英双语，便于维护

## 不做的工作

- 不启用 RLS（属于 Phase 1.5）
- 不引入 ORM 或数据访问层重构
- 不改写业务逻辑代码
- 不修改其他 Phase 的表结构

## 验收标准

- `doc/p0-development-progress.md` Phase 1 相关勾选项全部更新为 `[x]`
- `tests/phase1-schema.test.mjs` 所有测试通过
- `packages/db-types/src/index.ts` 不再为空导出
