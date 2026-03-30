# P0 数据库设计文档

基于当前技术栈：

- `Supabase Postgres`
- `Supabase Auth`
- `Supabase Vault`
- `Redis + BullMQ`
- `Next.js 16 + App Router`
- `Vercel AI SDK`

本文只覆盖 P0 范围：

- 仓库接入
- PR 自动审查
- 增量审查
- 低噪声排序与去重
- Agent 修复建议
- 仓库级 YAML 规则
- 基础安全审查
- 中 / 英 / 西三语输出
- 统一模型接入层

## 1. 设计目标

- 支撑多组织、多仓库、多 PR 的审查链路
- 支撑 `GitHub / GitLab / Gitee` 三类仓库接入
- 支撑一次 PR 多次增量审查
- 支撑问题去重、状态流转、反馈闭环
- 支撑组织级 / 仓库级模型绑定
- 支撑密钥入库但不明文存储
- 支撑前端 `RLS` 安全访问和服务端全量处理

## 2. 设计原则

- 所有业务表统一使用 `UUID` 主键
- 除 `organizations` 外，核心业务表统一带 `organization_id`
- 用户身份直接复用 `auth.users`
- 密钥不明文存表，统一通过 `Supabase Vault` 存储
- `review_run` 是审查链路的核心聚合实体
- 一个 PR 可以有多次 `review_run`
- 一个问题在每次 `review_run` 中都是一次独立命中，但通过 `fingerprint` 跨 run 去重
- Redis 负责队列，不负责业务状态存储

## 3. 统一约定

### 3.1 命名约定

- 表名使用复数：`repositories`、`review_runs`
- 外键统一为 `<entity>_id`
- 时间统一使用 `timestamptz`
- 非结构化上下文统一使用 `jsonb`

### 3.2 通用字段

除特殊说明外，表默认带：

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 3.3 建议枚举

- `git_provider`: `github` / `gitlab` / `gitee`
- `member_role`: `owner` / `admin` / `member`
- `repo_status`: `active` / `disabled`
- `review_mode`: `relaxed` / `standard` / `strict`
- `output_language`: `zh-CN` / `en-US` / `es-ES`
- `review_run_status`: `queued` / `running` / `succeeded` / `failed` / `retrying` / `cancelled`
- `review_trigger`: `pr_opened` / `pr_synchronize` / `pr_reopened` / `manual_rerun` / `rules_changed`
- `issue_type`: `quality` / `security`
- `severity`: `low` / `medium` / `high` / `critical`
- `issue_status`: `open` / `resolved` / `ignored` / `confirmed`
- `comment_status`: `draft` / `posted` / `skipped` / `failed` / `hidden`
- `feedback_type`: `helpful` / `unhelpful` / `false_positive` / `ignored`
- `ai_provider`: `openai` / `anthropic` / `alibaba`
- `ai_task_type`: `review_summary` / `review_findings` / `fix_prompt` / `embedding`
- `rule_source_type`: `platform_ui` / `repo_yaml`

## 4. 核心实体关系

```txt
organizations
  ├── memberships
  ├── repositories
  │     ├── repo_integrations
  │     ├── pull_requests
  │     │     ├── pr_commits
  │     │     ├── review_runs
  │     │     │     ├── changed_files
  │     │     │     ├── review_issues
  │     │     │     │     ├── review_comments
  │     │     │     │     └── review_feedback
  │     │     │     └── agent_prompts
  │     │     └── usage_events
  │     ├── rule_sets
  │     │     └── rule_versions
  │     └── ai_provider_bindings
  ├── ai_provider_configs
  └── webhook_events
```

## 5. 表设计

## 5.1 组织与成员

### `organizations`

用途：

- 多租户根实体
- 存组织默认语言、默认审查模式

关键字段：

| 字段                      | 类型            | 说明                 |
| ------------------------- | --------------- | -------------------- |
| `name`                    | text            | 组织名称             |
| `slug`                    | text unique     | 组织唯一标识         |
| `status`                  | text            | 组织状态             |
| `plan_tier`               | text            | 套餐层级             |
| `default_output_language` | output_language | 默认输出语言         |
| `default_review_mode`     | review_mode     | 默认审查模式         |
| `owner_user_id`           | uuid            | 对应 `auth.users.id` |

索引与约束：

- `unique(slug)`

### `memberships`

用途：

- 组织成员与角色

关键字段：

| 字段              | 类型                 | 说明                      |
| ----------------- | -------------------- | ------------------------- |
| `organization_id` | uuid fk              | 组织                      |
| `user_id`         | uuid fk              | 对应 `auth.users.id`      |
| `role`            | member_role          | `owner/admin/member`      |
| `status`          | text                 | `active/invited/disabled` |
| `invited_by`      | uuid nullable        | 邀请人                    |
| `joined_at`       | timestamptz nullable | 加入时间                  |

索引与约束：

- `unique(organization_id, user_id)`
- `index(user_id)`

## 5.2 仓库接入

### `repositories`

用途：

- 仓库主档
- 挂默认语言、默认审查模式、默认模型绑定

关键字段：

| 字段                      | 类型                 | 说明                  |
| ------------------------- | -------------------- | --------------------- |
| `organization_id`         | uuid fk              | 所属组织              |
| `provider`                | git_provider         | 仓库平台              |
| `provider_repo_id`        | text                 | 平台仓库 ID           |
| `name`                    | text                 | 仓库名                |
| `full_name`               | text                 | 完整名，如 `org/repo` |
| `default_branch`          | text                 | 默认分支              |
| `status`                  | repo_status          | 启用状态              |
| `default_output_language` | output_language      | 仓库默认输出语言      |
| `default_review_mode`     | review_mode          | 仓库默认审查模式      |
| `default_ai_binding_id`   | uuid nullable        | 默认模型绑定          |
| `last_synced_at`          | timestamptz nullable | 最后同步时间          |

索引与约束：

- `unique(organization_id, provider, provider_repo_id)`
- `index(organization_id, status)`

### `repo_integrations`

用途：

- 保存仓库接入配置
- 保存安装信息、授权信息、同步元数据

关键字段：

| 字段                             | 类型          | 说明                                        |
| -------------------------------- | ------------- | ------------------------------------------- |
| `organization_id`                | uuid fk       | 所属组织                                    |
| `repository_id`                  | uuid fk       | 仓库                                        |
| `provider`                       | git_provider  | 平台                                        |
| `installation_id`                | text nullable | App 安装 ID                                 |
| `provider_owner_id`              | text nullable | 平台 owner ID                               |
| `credential_vault_secret_id`     | uuid nullable | 如 provider 需要长期 token，则存 Vault 引用 |
| `webhook_secret_vault_secret_id` | uuid nullable | webhook secret 引用                         |
| `status`                         | text          | `active/error/revoked`                      |
| `metadata`                       | jsonb         | 安装信息、权限信息                          |

索引与约束：

- `unique(repository_id, provider)`
- `index(organization_id, provider)`

### `webhook_events`

用途：

- webhook 幂等
- 保留平台回调接收记录

关键字段：

| 字段              | 类型                 | 说明                                |
| ----------------- | -------------------- | ----------------------------------- |
| `organization_id` | uuid nullable        | 可在解析后回填                      |
| `repository_id`   | uuid nullable        | 可在解析后回填                      |
| `provider`        | git_provider         | 平台                                |
| `event_type`      | text                 | 事件类型                            |
| `delivery_id`     | text                 | 平台投递 ID                         |
| `signature_valid` | boolean              | 验签结果                            |
| `payload_hash`    | text                 | 请求体 hash                         |
| `status`          | text                 | `received/processed/ignored/failed` |
| `payload`         | jsonb                | 原始 payload                        |
| `processed_at`    | timestamptz nullable | 处理完成时间                        |
| `error_message`   | text nullable        | 失败原因                            |

索引与约束：

- `unique(provider, delivery_id)`
- `index(status, created_at desc)`

## 5.3 PR 与变更快照

### `pull_requests`

用途：

- PR 主档
- 记录最新 base/head、分支、状态

关键字段：

| 字段                   | 类型                 | 说明                 |
| ---------------------- | -------------------- | -------------------- |
| `organization_id`      | uuid fk              | 所属组织             |
| `repository_id`        | uuid fk              | 仓库                 |
| `provider_pr_id`       | text                 | 平台 PR ID           |
| `provider_pr_number`   | integer              | 平台 PR 编号         |
| `title`                | text                 | PR 标题              |
| `description`          | text nullable        | PR 描述              |
| `author_login`         | text nullable        | 作者账号             |
| `base_branch`          | text                 | 目标分支             |
| `head_branch`          | text                 | 来源分支             |
| `base_sha`             | text                 | 当前基准 sha         |
| `head_sha`             | text                 | 当前 head sha        |
| `state`                | text                 | `open/closed/merged` |
| `opened_at`            | timestamptz          | 打开时间             |
| `closed_at`            | timestamptz nullable | 关闭时间             |
| `merged_at`            | timestamptz nullable | 合并时间             |
| `latest_review_run_id` | uuid nullable        | 最近一次审查         |

索引与约束：

- `unique(repository_id, provider_pr_number)`
- `index(repository_id, state)`
- `index(repository_id, head_sha)`

### `pr_commits`

用途：

- PR 下的 commit 列表
- 支撑增量审查和新旧 run 比较

关键字段：

| 字段              | 类型                 | 说明       |
| ----------------- | -------------------- | ---------- |
| `organization_id` | uuid fk              | 所属组织   |
| `pull_request_id` | uuid fk              | PR         |
| `commit_sha`      | text                 | commit sha |
| `parent_sha`      | text nullable        | 父 commit  |
| `author_name`     | text nullable        | 作者       |
| `author_email`    | text nullable        | 作者邮箱   |
| `committed_at`    | timestamptz nullable | 提交时间   |

索引与约束：

- `unique(pull_request_id, commit_sha)`
- `index(pull_request_id, committed_at desc)`

### `changed_files`

用途：

- 每次 `review_run` 的变更文件快照
- 支撑增量审查、文件级筛选、文件定位

关键字段：

| 字段              | 类型          | 说明                             |
| ----------------- | ------------- | -------------------------------- |
| `organization_id` | uuid fk       | 所属组织                         |
| `pull_request_id` | uuid fk       | PR                               |
| `review_run_id`   | uuid fk       | 审查 run                         |
| `file_path`       | text          | 当前路径                         |
| `previous_path`   | text nullable | rename 前路径                    |
| `change_type`     | text          | `added/modified/deleted/renamed` |
| `additions`       | integer       | 新增行数                         |
| `deletions`       | integer       | 删除行数                         |
| `is_binary`       | boolean       | 是否二进制                       |
| `patch_excerpt`   | text nullable | diff 摘要                        |

索引与约束：

- `unique(review_run_id, file_path, previous_path)`
- `index(pull_request_id, review_run_id)`

## 5.4 审查执行与结果

### `review_runs`

用途：

- 一次审查任务的主记录
- 连接队列、规则快照、模型配置、统计结果

关键字段：

| 字段                          | 类型                 | 说明                  |
| ----------------------------- | -------------------- | --------------------- |
| `organization_id`             | uuid fk              | 所属组织              |
| `repository_id`               | uuid fk              | 仓库                  |
| `pull_request_id`             | uuid fk              | PR                    |
| `run_number`                  | integer              | PR 内部递增编号       |
| `trigger_type`                | review_trigger       | 触发来源              |
| `trigger_event_id`            | uuid nullable fk     | 对应 `webhook_events` |
| `review_mode`                 | review_mode          | 审查模式              |
| `output_language`             | output_language      | 输出语言              |
| `status`                      | review_run_status    | 状态机                |
| `base_sha`                    | text                 | 本次比较 base         |
| `head_sha`                    | text                 | 本次比较 head         |
| `queue_job_id`                | text nullable        | BullMQ job id         |
| `ai_provider_config_id`       | uuid nullable fk     | 主模型配置            |
| `ai_model_name`               | text nullable        | 主模型名              |
| `fallback_provider_config_id` | uuid nullable fk     | fallback 模型配置     |
| `fallback_model_name`         | text nullable        | fallback 模型名       |
| `rule_snapshot`               | jsonb                | 实际生效规则快照      |
| `summary_md`                  | text nullable        | PR 摘要               |
| `analyzed_files_count`        | integer default 0    | 分析文件数            |
| `findings_count`              | integer default 0    | 问题数                |
| `security_findings_count`     | integer default 0    | 安全问题数            |
| `started_at`                  | timestamptz nullable | 开始时间              |
| `finished_at`                 | timestamptz nullable | 结束时间              |
| `error_code`                  | text nullable        | 错误码                |
| `error_message`               | text nullable        | 错误信息              |

索引与约束：

- `unique(pull_request_id, run_number)`
- `index(pull_request_id, created_at desc)`
- `index(status, created_at desc)`

### `review_issues`

用途：

- 审查命中的标准问题实体
- 支撑去重、排序、过滤、状态流转

关键字段：

| 字段                 | 类型             | 说明                              |
| -------------------- | ---------------- | --------------------------------- |
| `organization_id`    | uuid fk          | 所属组织                          |
| `repository_id`      | uuid fk          | 仓库                              |
| `pull_request_id`    | uuid fk          | PR                                |
| `review_run_id`      | uuid fk          | 审查 run                          |
| `fingerprint`        | text             | 规范化问题指纹                    |
| `issue_type`         | issue_type       | `quality/security`                |
| `category`           | text nullable    | 规则类型或分类                    |
| `title`              | text             | 问题标题                          |
| `summary`            | text             | 问题摘要                          |
| `severity`           | severity         | 严重级别                          |
| `confidence_score`   | numeric(5,4)     | 置信度                            |
| `fixability_score`   | numeric(5,4)     | 可修复度                          |
| `file_path`          | text nullable    | 文件路径                          |
| `start_line`         | integer nullable | 起始行                            |
| `end_line`           | integer nullable | 结束行                            |
| `code_excerpt`       | text nullable    | 代码片段                          |
| `suggestion_md`      | text nullable    | 修复建议                          |
| `root_cause`         | text nullable    | 根因                              |
| `impact_scope`       | text nullable    | 影响范围                          |
| `status`             | issue_status     | `open/resolved/ignored/confirmed` |
| `first_seen_run_id`  | uuid nullable    | 首次出现 run                      |
| `last_seen_run_id`   | uuid nullable    | 最近一次出现 run                  |
| `resolved_in_run_id` | uuid nullable    | 被标记解决的 run                  |
| `ignored_by_user_id` | uuid nullable    | 忽略人                            |
| `ignored_reason`     | text nullable    | 忽略原因                          |

索引与约束：

- `unique(review_run_id, fingerprint)`
- `index(pull_request_id, fingerprint)`
- `index(review_run_id, severity, confidence_score desc)`
- `index(review_run_id, issue_type)`

说明：

- `fingerprint` 用于跨 run 识别同一类问题
- 同一 PR、不同 run 可以出现相同 `fingerprint`
- 去重和“已解决/重复评论”判断主要依赖 `pull_request_id + fingerprint`

### `review_comments`

用途：

- 记录平台评论回写和 UI 展示内容
- 记录是否真正发布到 Git 平台

关键字段：

| 字段                  | 类型                  | 说明         |
| --------------------- | --------------------- | ------------ |
| `organization_id`     | uuid fk               | 所属组织     |
| `pull_request_id`     | uuid fk               | PR           |
| `review_run_id`       | uuid fk               | 审查 run     |
| `review_issue_id`     | uuid fk               | 问题         |
| `provider`            | git_provider nullable | 平台         |
| `external_comment_id` | text nullable         | 平台评论 ID  |
| `body_md`             | text                  | 评论内容     |
| `output_language`     | output_language       | 输出语言     |
| `status`              | comment_status        | 评论状态     |
| `is_inline`           | boolean               | 是否行内评论 |
| `file_path`           | text nullable         | 评论文件     |
| `line_number`         | integer nullable      | 评论行       |
| `posted_at`           | timestamptz nullable  | 发布时间     |
| `last_synced_at`      | timestamptz nullable  | 最近同步时间 |
| `error_message`       | text nullable         | 发布失败原因 |

索引与约束：

- `unique(provider, external_comment_id)` where `external_comment_id is not null`
- `index(review_issue_id)`
- `index(review_run_id, status)`

### `review_feedback`

用途：

- 收集“有帮助 / 无帮助 / 误报 / 忽略”反馈

关键字段：

| 字段              | 类型          | 说明                 |
| ----------------- | ------------- | -------------------- |
| `organization_id` | uuid fk       | 所属组织             |
| `review_issue_id` | uuid fk       | 问题                 |
| `review_run_id`   | uuid fk       | 审查 run             |
| `user_id`         | uuid fk       | 对应 `auth.users.id` |
| `feedback_type`   | feedback_type | 反馈类型             |
| `reason`          | text nullable | 原因                 |

索引与约束：

- `unique(review_issue_id, user_id)`
- `index(review_run_id, feedback_type)`

### `agent_prompts`

用途：

- 存储给 Agent 的修复提示词
- 支撑单条问题、多条问题合并生成

关键字段：

| 字段                   | 类型                 | 说明                                       |
| ---------------------- | -------------------- | ------------------------------------------ |
| `organization_id`      | uuid fk              | 所属组织                                   |
| `repository_id`        | uuid fk              | 仓库                                       |
| `pull_request_id`      | uuid fk              | PR                                         |
| `review_run_id`        | uuid fk              | 审查 run                                   |
| `source_type`          | text                 | `single_issue/multi_issue/security_bundle` |
| `source_issue_ids`     | uuid[]               | 来源问题                                   |
| `agent_kind`           | text                 | 先固定 `generic`                           |
| `output_language`      | output_language      | 输出语言                                   |
| `prompt_md`            | text                 | 提示词正文                                 |
| `prompt_hash`          | text                 | 内容 hash                                  |
| `generated_by_user_id` | uuid nullable        | 触发人                                     |
| `copied_count`         | integer default 0    | 复制次数                                   |
| `last_copied_at`       | timestamptz nullable | 最近复制时间                               |

索引与约束：

- `index(review_run_id, created_at desc)`
- `index(pull_request_id, created_at desc)`

## 5.5 规则系统

### `rule_sets`

用途：

- 规则集合主档
- 一个仓库可以有平台规则和仓库 YAML 规则两类集合

关键字段：

| 字段                 | 类型                 | 说明                    |
| -------------------- | -------------------- | ----------------------- |
| `organization_id`    | uuid fk              | 所属组织                |
| `repository_id`      | uuid fk              | 仓库                    |
| `source_type`        | rule_source_type     | `platform_ui/repo_yaml` |
| `name`               | text                 | 规则集名称              |
| `is_active`          | boolean              | 是否启用                |
| `current_version_id` | uuid nullable        | 当前版本                |
| `last_applied_at`    | timestamptz nullable | 最近生效时间            |

索引与约束：

- `index(repository_id, source_type, is_active)`

### `rule_versions`

用途：

- 规则版本化
- 保存 YAML 原文、解析结果、校验错误

关键字段：

| 字段                 | 类型           | 说明                              |
| -------------------- | -------------- | --------------------------------- |
| `organization_id`    | uuid fk        | 所属组织                          |
| `rule_set_id`        | uuid fk        | 规则集                            |
| `version_no`         | integer        | 版本号                            |
| `content_yaml`       | text           | YAML 原文                         |
| `content_json`       | jsonb nullable | 解析后的结构化内容                |
| `checksum`           | text           | 内容 hash                         |
| `validation_status`  | text           | `valid/invalid`                   |
| `validation_errors`  | jsonb nullable | 校验错误                          |
| `source_commit_sha`  | text nullable  | 如来自仓库文件，可记录 commit sha |
| `created_by_user_id` | uuid nullable  | 创建人                            |

索引与约束：

- `unique(rule_set_id, version_no)`
- `index(rule_set_id, created_at desc)`

## 5.6 模型接入与密钥管理

### `ai_provider_configs`

用途：

- 记录组织下可用的模型提供方配置
- 通过 `vault_secret_id` 指向加密密钥

关键字段：

| 字段                 | 类型           | 说明                          |
| -------------------- | -------------- | ----------------------------- |
| `organization_id`    | uuid fk        | 所属组织                      |
| `provider`           | ai_provider    | `openai/anthropic/alibaba`    |
| `display_name`       | text           | 后台展示名称                  |
| `vault_secret_id`    | uuid           | Supabase Vault 中的 secret ID |
| `base_url`           | text nullable  | 自定义 endpoint               |
| `masked_key_suffix`  | text nullable  | 掩码展示，例如后四位          |
| `is_active`          | boolean        | 是否启用                      |
| `created_by_user_id` | uuid nullable  | 创建人                        |
| `metadata`           | jsonb nullable | 额外配置                      |

索引与约束：

- `index(organization_id, provider, is_active)`
- `unique(organization_id, display_name)`

说明：

- 不保存明文密钥
- 前端只读 `display_name`、`provider`、`masked_key_suffix`

### `ai_provider_bindings`

用途：

- 把模型配置绑定到组织或仓库
- 可按任务类型指定主模型和 fallback 模型

关键字段：

| 字段                          | 类型              | 说明               |
| ----------------------------- | ----------------- | ------------------ |
| `organization_id`             | uuid fk           | 所属组织           |
| `repository_id`               | uuid nullable fk  | 为空表示组织级默认 |
| `task_type`                   | ai_task_type      | 任务类型           |
| `provider_config_id`          | uuid fk           | 主配置             |
| `model_name`                  | text              | 主模型名           |
| `fallback_provider_config_id` | uuid nullable fk  | fallback 配置      |
| `fallback_model_name`         | text nullable     | fallback 模型名    |
| `is_active`                   | boolean           | 是否启用           |
| `priority`                    | integer default 0 | 预留排序           |

索引与约束：

- `index(organization_id, repository_id, task_type, is_active)`
- 组织级默认建议唯一：`unique(organization_id, task_type)` where `repository_id is null and is_active`
- 仓库级覆盖建议唯一：`unique(repository_id, task_type)` where `repository_id is not null and is_active`

## 5.7 计量与事件

### `usage_events`

用途：

- 记录模型调用和关键行为事件
- 支撑成本、成功率、延迟分析

关键字段：

| 字段                 | 类型                   | 说明                                     |
| -------------------- | ---------------------- | ---------------------------------------- |
| `organization_id`    | uuid fk                | 所属组织                                 |
| `repository_id`      | uuid nullable fk       | 仓库                                     |
| `pull_request_id`    | uuid nullable fk       | PR                                       |
| `review_run_id`      | uuid nullable fk       | 审查 run                                 |
| `review_issue_id`    | uuid nullable fk       | 问题                                     |
| `agent_prompt_id`    | uuid nullable fk       | 提示词                                   |
| `event_type`         | text                   | `ai_call/prompt_generated/prompt_copied` |
| `task_type`          | ai_task_type nullable  | 模型任务                                 |
| `provider_config_id` | uuid nullable fk       | 使用的模型配置                           |
| `provider`           | ai_provider nullable   | 提供方                                   |
| `model_name`         | text nullable          | 模型名                                   |
| `input_tokens`       | integer nullable       | 输入 tokens                              |
| `output_tokens`      | integer nullable       | 输出 tokens                              |
| `latency_ms`         | integer nullable       | 延迟                                     |
| `estimated_cost`     | numeric(12,6) nullable | 估算成本                                 |
| `success`            | boolean nullable       | 是否成功                                 |
| `error_code`         | text nullable          | 错误码                                   |
| `metadata`           | jsonb nullable         | 扩展字段                                 |
| `occurred_at`        | timestamptz            | 事件发生时间                             |

索引与约束：

- `index(organization_id, occurred_at desc)`
- `index(review_run_id, event_type)`
- `index(provider, model_name, occurred_at desc)`

## 6. 补充说明

## 6.1 为什么要有 `webhook_events`

- P0 要求 webhook 幂等
- Redis 只负责任务编排，不适合做幂等账本
- `webhook_events` 可以直接做“收到了没、处理过没、失败原因是什么”的追踪

## 6.2 为什么 `review_issues` 不直接覆盖旧数据

- P0 要求增量审查
- 需要比较新旧 run
- 保留每次 run 的问题快照，才能判断“新增 / 已解决 / 重复”

## 6.3 为什么 `review_comments` 和 `review_issues` 分开

- 问题是内部标准实体
- 评论是展示和外部平台同步结果
- 一条问题不一定要发评论
- 同一问题可能对应不同语言、不同平台、不同展示样式

## 6.4 为什么 `agent_prompts` 单独建表

- P0 已把 Agent 修复建议列为核心能力
- 它既不是 issue，也不是 comment
- 需要统计生成次数和复制次数

## 7. 密钥设计

推荐方案：

- `ai_provider_configs` 只保存 `vault_secret_id`
- 真实密钥存入 `Supabase Vault`
- 服务端或 Worker 通过受控 RPC 或服务端查询读取
- 前端永远不返回原始密钥

建议补一个服务端安全函数：

- `get_ai_provider_secret(provider_config_id uuid)`

用途：

- 校验当前组织是否有权使用该配置
- 返回解密后的密钥给服务端 / Worker
- 避免业务代码直接读 Vault 系统表

## 8. RLS 建议

浏览器可读表：

- `organizations`
- `memberships`
- `repositories`
- `pull_requests`
- `review_runs`
- `review_issues`
- `review_comments`
- `review_feedback`
- `rule_sets`
- `rule_versions`
- `agent_prompts`

浏览器只读掩码视图，不直接读原表：

- `ai_provider_configs_masked_v`

默认不开放给浏览器：

- `repo_integrations`
- `webhook_events`
- `ai_provider_configs`
- `usage_events`

RLS 核心规则：

- 用户必须存在有效 `memberships`
- 只能访问自己所属 `organization_id` 的数据
- `owner/admin` 才能修改规则和模型配置
- `service_role` 可全量访问

## 9. 存储与数据库边界

以下内容不直接入库正文，入 `Supabase Storage`，数据库只存引用或摘要：

- 大体积 diff 原文
- 审查日志文件
- 导出文件
- 长文本快照

建议路径：

- `review-artifacts/{organization_id}/{repository_id}/{review_run_id}/...`
- `review-logs/{organization_id}/{review_run_id}/...`
- `exports/{organization_id}/{agent_prompt_id}.md`

P0 阶段可以先把 Storage 路径放在对应实体的 `metadata jsonb` 中，不额外拆表。

## 10. 建索引重点

- [ ] `memberships(organization_id, user_id)` 唯一
- [ ] `repositories(organization_id, provider, provider_repo_id)` 唯一
- [ ] `pull_requests(repository_id, provider_pr_number)` 唯一
- [ ] `pr_commits(pull_request_id, commit_sha)` 唯一
- [ ] `webhook_events(provider, delivery_id)` 唯一
- [ ] `review_runs(pull_request_id, run_number)` 唯一
- [ ] `review_issues(review_run_id, fingerprint)` 唯一
- [ ] `review_issues(pull_request_id, fingerprint)` 普通索引
- [ ] `review_comments(provider, external_comment_id)` 唯一
- [ ] `review_feedback(review_issue_id, user_id)` 唯一
- [ ] `ai_provider_bindings` 组织级和仓库级默认绑定唯一

## 11. 建表顺序建议

- [ ] 建 `organizations`
- [ ] 建 `memberships`
- [ ] 建 `repositories`
- [ ] 建 `repo_integrations`
- [ ] 建 `webhook_events`
- [ ] 建 `pull_requests`
- [ ] 建 `pr_commits`
- [ ] 建 `rule_sets`
- [ ] 建 `rule_versions`
- [ ] 建 `ai_provider_configs`
- [ ] 建 `ai_provider_bindings`
- [ ] 建 `review_runs`
- [ ] 建 `changed_files`
- [ ] 建 `review_issues`
- [ ] 建 `review_comments`
- [ ] 建 `review_feedback`
- [ ] 建 `agent_prompts`
- [ ] 建 `usage_events`
- [ ] 配置 `RLS`
- [ ] 配置 `Vault` 读取方案

## 12. P0 暂不单独建表

- 知识库向量分片表
- 需求转计划相关表
- IDE / CLI 本地审查表
- 企业审计全量日志表
- 多仓依赖图谱表

一句话结论：

> P0 数据库的核心是以 `organization -> repository -> pull_request -> review_run -> review_issue` 这条主链路为中心，再补齐规则、模型绑定、反馈和 Agent 提示词四类支撑表。
