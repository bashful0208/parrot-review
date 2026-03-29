# P0 交付细化清单

基于当前技术栈：

- `Next.js 16 + App Router + TypeScript`
- `Supabase Postgres + Auth + Storage + Realtime + Vault`
- `Redis + BullMQ`
- `独立 Worker`
- `Vercel AI SDK`

目标范围只覆盖当前 P0：

- 仓库接入
- PR 自动审查
- 增量审查
- 低噪声排序与去重
- Agent 修复建议
- 仓库级 YAML 规则
- 基础安全审查
- 中 / 英 / 西三语输出
- 统一模型接入层

## 1. 基础工程

- [x] 初始化 monorepo 结构：`apps/web`、`apps/worker`、`packages/ai`、`packages/core`、`packages/git`、`packages/db-types`
- [x] 建立统一环境变量规范：Supabase、Redis、Webhook Secret、模型默认路由
- [ ] 接入 `ESLint`、`TypeScript`、`Prettier`
- [x] 建立 `pnpm` workspace 和统一脚本：`dev:web`、`dev:worker`、`build`、`test`
- [x] 建立基础日志规范：请求 ID、任务 ID、组织 ID、仓库 ID
- [x] 建立错误分类：用户配置错误、平台回调错误、模型调用错误、规则解析错误、任务超时

## 2. 数据库与表结构

### 2.1 组织与权限

- [ ] 建立 `organizations`
- [ ] 建立 `memberships`
- [ ] 建立基础角色：`owner`、`admin`、`member`
- [ ] 为核心业务表补 `organization_id`
- [ ] 开启 `RLS`
- [ ] 确保用户只能访问自己组织的数据

### 2.2 仓库与 PR 主数据

- [ ] 建立 `repositories`
- [ ] 建立 `repo_integrations`
- [ ] 建立 `pull_requests`
- [ ] 建立 `pr_commits`
- [ ] 建立 `changed_files`
- [ ] 建立仓库默认语言、审查严格度、默认模型绑定字段

### 2.3 审查结果数据

- [ ] 建立 `review_runs`
- [ ] 建立 `review_issues`
- [ ] 建立 `review_comments`
- [ ] 建立 `review_feedback`
- [ ] 建立 `agent_prompts`
- [ ] 建立 `usage_events`
- [ ] 设计 `review_run` 状态机：`queued`、`running`、`succeeded`、`failed`、`retrying`、`cancelled`

### 2.4 规则与模型配置

- [ ] 建立 `rule_sets`
- [ ] 建立 `rule_versions`
- [ ] 建立 `ai_provider_configs`
- [ ] 建立 `ai_provider_bindings`
- [ ] 业务表只保存 `vault_secret_id` 和元数据，不保存明文密钥

## 3. 密钥与安全

- [ ] 使用 `Supabase Vault` 存储模型密钥
- [ ] 后台支持录入 `OpenAI / Anthropic / Alibaba(Qwen)` 密钥
- [ ] 前端只显示掩码后的模型配置
- [ ] 禁止前端读取原始密钥
- [ ] `worker` 调模型前按组织 / 仓库读取对应 provider 密钥
- [ ] 日志、错误栈、审计记录中不打印完整密钥
- [ ] 支持禁用失效的 provider 配置

## 4. 控制台与账号体系

- [ ] 基于 `Supabase Auth` 完成登录
- [ ] 完成组织切换
- [ ] 完成成员管理基础页面
- [ ] 完成仓库列表页
- [ ] 完成仓库接入向导页
- [ ] 完成 PR 列表页
- [ ] 完成 PR 审查详情页
- [ ] 完成规则配置页
- [ ] 完成模型配置页

## 5. 仓库接入

### 5.1 平台接入

- [ ] 支持 `GitHub` 接入
- [ ] 支持 `GitLab` 接入
- [ ] 支持 `Gitee` 接入
- [ ] 统一抽象 provider 接口：安装信息、仓库列表、PR 拉取、diff 拉取、评论回写

### 5.2 接入流程

- [ ] 实现 OAuth / App 安装后的回调处理
- [ ] 支持最小权限校验
- [ ] 支持选择要接入的仓库
- [ ] 首次接入自动拉取仓库元信息
- [ ] 接入完成后自动触发一次健康检查
- [ ] 接入失败时给出明确错误提示

### 5.3 Webhook

- [ ] 为 `GitHub / GitLab / Gitee` 建立独立 webhook handler
- [ ] 验签
- [ ] 识别 `PR opened / synchronize / reopened`
- [ ] 识别评论和状态回写事件
- [ ] 实现 webhook 幂等
- [ ] webhook 只负责写库和入队，不做重活

## 6. 队列与 Worker

### 6.1 BullMQ

- [ ] 建立 `pr_review_jobs`
- [ ] 建立 `review_retry_jobs`
- [ ] 配置重试次数和退避策略
- [ ] 配置任务超时
- [ ] 配置死信处理策略
- [ ] 支持任务去重键

### 6.2 Worker 主链路

- [ ] 读取审查任务
- [ ] 拉取目标仓库和 PR 信息
- [ ] 获取 base/head diff
- [ ] 解析变更文件列表
- [ ] 拉取必要上下文文件
- [ ] 合并规则配置
- [ ] 构造模型输入
- [ ] 调用 AI 生成摘要、问题、修复提示词
- [ ] 写回审查结果
- [ ] 推送审查状态更新

### 6.3 稳定性

- [ ] 任务失败可重试
- [ ] 模型超时可 fallback
- [ ] 拉仓库失败可重试
- [ ] 重复 webhook 不重复生成多份结果
- [ ] 任务可取消

## 7. AI 接入层

### 7.1 `packages/ai`

- [ ] 建立统一 provider 工厂
- [ ] 建立统一任务接口：`generateReviewSummary`
- [ ] 建立统一任务接口：`generateReviewFindings`
- [ ] 建立统一任务接口：`generateFixPrompt`
- [ ] 建立统一任务接口：`embedKnowledge`
- [ ] 统一结构化输出 schema

### 7.2 Provider 支持

- [ ] 接入 `OpenAI`
- [ ] 接入 `Anthropic`
- [ ] 接入 `Alibaba(Qwen)`
- [ ] 支持组织级默认 provider
- [ ] 支持仓库级覆盖 provider
- [ ] 支持 fallback provider

### 7.3 调用治理

- [ ] 记录 `provider`
- [ ] 记录 `model`
- [ ] 记录 `task_type`
- [ ] 记录 `latency_ms`
- [ ] 记录 `input_tokens`
- [ ] 记录 `output_tokens`
- [ ] 记录 `estimated_cost`
- [ ] 记录 `success / failure`

## 8. PR 自动审查

### 8.1 审查输入

- [ ] 支持读取 PR 标题、描述、diff
- [ ] 支持读取变更文件路径
- [ ] 支持读取相邻上下文文件
- [ ] 支持注入仓库规则
- [ ] 支持注入默认语言

### 8.2 审查输出

- [ ] 生成 PR 摘要
- [ ] 生成问题列表
- [ ] 每条问题带严重级别
- [ ] 每条问题带置信度
- [ ] 每条问题带文件定位信息
- [ ] 每条问题带修复建议

### 8.3 展示

- [ ] PR 详情页展示摘要
- [ ] PR 详情页展示问题列表
- [ ] 支持按严重级别筛选
- [ ] 支持按可修复筛选
- [ ] 支持按安全问题筛选

## 9. 增量审查

- [ ] 识别 `synchronize` 事件
- [ ] 只分析新增 commit 的 diff
- [ ] 比较新旧 `review_run`
- [ ] 自动标记已解决问题
- [ ] 自动折叠旧问题
- [ ] 高亮新增问题
- [ ] 控制重复评论率

## 10. 低噪声排序与去重

### 10.1 排序

- [ ] 建立 `severity` 评分
- [ ] 建立 `confidence` 评分
- [ ] 建立 `fixability` 评分
- [ ] 建立总排序规则
- [ ] 默认只展示高价值问题

### 10.2 去重

- [ ] 相同文件、相同问题类型做去重
- [ ] 同一问题跨次审查做合并识别
- [ ] 已忽略问题避免重复出现
- [ ] 已确认问题避免重复刷屏

### 10.3 用户反馈

- [ ] 支持标记“有帮助”
- [ ] 支持标记“无帮助”
- [ ] 支持标记“误报”
- [ ] 支持填写忽略原因

## 11. Agent 修复建议

- [ ] 支持按单条问题生成修复提示词
- [ ] 支持按多条问题合并生成修复提示词
- [ ] 输出结构包含：问题摘要、根因、影响范围、修改约束、验收标准、测试建议
- [ ] 支持一键复制
- [ ] 记录提示词生成与复制事件
- [ ] 支持中 / 英 / 西三语模板

## 12. 仓库级 YAML 规则

### 12.1 规则能力

- [ ] 支持仓库根目录规则文件
- [ ] 支持忽略目录
- [ ] 支持忽略文件类型
- [ ] 支持严格度配置
- [ ] 支持评论阈值配置
- [ ] 支持少量默认规则模板

### 12.2 规则校验

- [ ] 规则文件格式校验
- [ ] 错误提示清晰展示
- [ ] 支持查看当前生效规则
- [ ] 支持查看某条评论命中了哪些规则

## 13. 基础安全审查

- [ ] 定义首版支持的高频风险类型
- [ ] 建立基础安全规则库
- [ ] 安全问题单独分类展示
- [ ] 安全问题默认高优先级
- [ ] 安全问题支持生成修复提示词
- [ ] 避免被低噪声模式完全折叠

## 14. 多语言输出

- [ ] 支持中文输出
- [ ] 支持英文输出
- [ ] 支持西班牙语输出
- [ ] 支持仓库默认语言
- [ ] 支持用户临时切换
- [ ] 同一问题在不同语言下保持严重级别和修复方向一致
- [ ] 统一术语表

## 15. 实时状态与通知

- [ ] `review_run` 状态变化通过 `Supabase Realtime` 推送
- [ ] 控制台自动刷新任务状态
- [ ] 审查完成后刷新问题列表
- [ ] 审查失败时展示失败原因

## 16. 观测与运维

- [ ] 接入任务日志
- [ ] 接入模型调用日志
- [ ] 接入 webhook 接收日志
- [ ] 统计首轮分析耗时
- [ ] 统计增量审查耗时
- [ ] 统计误报反馈率
- [ ] 统计建议采纳率
- [ ] 统计 Agent 提示词使用率

## 17. 测试与验收

### 17.1 自动化测试

- [ ] webhook handler 单测
- [ ] 队列入队 / 消费测试
- [ ] 规则解析测试
- [ ] AI 输出 schema 校验测试
- [ ] 审查结果去重测试
- [ ] 多语言模板测试

### 17.2 P0 验收

- [ ] 新仓库能在 10 分钟内完成接入
- [ ] 新 PR 能自动触发审查
- [ ] 首轮反馈可在目标时间内返回
- [ ] 增量提交不会大量重复评论
- [ ] 可稳定生成 Agent 修复提示词
- [ ] YAML 规则可生效
- [ ] 安全问题可单独识别
- [ ] 中 / 英 / 西输出可切换
- [ ] 模型可按组织 / 仓库切换
- [ ] 模型密钥可从数据库安全读取

## 18. P0 明确不做

- [ ] 不做一键修复
- [ ] 不做 IDE 插件
- [ ] 不做 CLI 审查
- [ ] 不做需求转计划
- [ ] 不做复杂模型路由 UI
- [ ] 不做大而全 BI 看板
