# Dashboard 首页数据化重构

> 将首页从"结构优先 + 占位数据"升级为"全部真实数据驱动"，移除 mock 数据，重组区块。

## 背景

2026-04-02 的初版设计采用了"结构优先"策略，建立了 DashboardHero、DashboardKpiGrid、DashboardQuickActions、RecentReviewRuns、RiskInsights、RepositoryHealthList 六个区块。当时仅 RecentReviewRuns 接入了真实数据，其余均为硬编码 mock。

当前项目已具备更多可用的真实数据源（usage、webhook stats、repo list），且用户确认：
- 系统不做计费，不需要 cost 相关展示
- 首页 New Review 按钮已移除
- 所有展示内容必须来自已有数据

## 设计目标

1. 移除所有 mock 数据，每个区块都从数据库查询真实数据
2. 移除不再需要的区块（QuickActions、RiskInsights）
3. 新增 Usage Overview 区块，利用已有的 usage 数据
4. 保持现有组件结构和视觉风格不变

## 区块变更

### 移除

- **DashboardQuickActions** — 3 个快捷操作（New Review、Connect Repository、View All Runs），sidebar 已有对应入口
- **RiskInsights** — severity 分布 + weekly trend，均为 mock 数据；review_issues 聚合查询暂缺，先移除

### 保留并改造

**DashboardHero** — 简化：
- org name 从 `organizations` 表取真实值（当前硬编码 "Acme Engineering"）
- 去掉冗余文案，保留组织名 + 当前用户

**DashboardKpiGrid** — 4 个 KPI 全部接入真实数据：

| KPI | 数据来源 | 查询方式 |
|-----|---------|---------|
| Active Repositories | `listRepositoriesByOrganization()` | 已有，取 count |
| Reviews This Week | `review_runs` 表 | 新增 `getReviewRunCount(orgId, since)` |
| Open Findings | `review_issues` 表 | 新增 `getOpenFindingsCount(orgId)` |
| Success Rate | `review_runs` 表 | 新增 `getReviewRunSuccessRate(orgId, since)` |

**RecentReviewRuns** — 保持，已接入 `listRecentReviewRuns()`

**RepositoryHealthList** — 替换 mock 为 `listRepositoriesByOrganization()` 真实数据：
- 每个 repo 的名称、status 直接映射
- open findings 和 last review 需要关联查询（新增 `getRepositoryHealthItems(orgId)`）

### 新增

**UsageOverview** — 使用已有的 `getUsageSummary()` + `getDailyUsageStats()`：
- 左侧：7 天调用量迷你折线图（复用 recharts，参照 `UsageDailyCallsChart`）
- 右侧：Total Calls / Avg Latency 两个摘要数字
- 不展示 cost 相关数据

## 布局

```
┌─────────────────────────────────┐
│         Hero (简化)              │
├──────┬──────┬──────┬────────────┤
│ KPI  │ KPI  │ KPI  │ KPI       │  ← 真实数据
├──────┴──────┼──────┴────────────┤
│ Recent Runs │ Repository Health │  ← 真实数据
├─────────────┴───────────────────┤
│       Usage Overview            │  ← 新增
│    (chart + latency/calls)      │
└─────────────────────────────────┘
```

## 数据层变更

### packages/core 新增查询函数

1. `getReviewRunCount(orgId, since)` — 统计指定时间段内的 review runs 总数
2. `getOpenFindingsCount(orgId)` — 统计未解决的 review issues 数量
3. `getReviewRunSuccessRate(orgId, since)` — 计算 review runs 成功率
4. `getRepositoryHealthItems(orgId)` — 获取仓库健康列表（含 open findings 计数和最近审查时间）

### apps/web view-model 变更

- `buildDashboardViewModel()` 改为 async，接收所有真实数据源
- 移除 `mock-data.ts` 中对 KPI、insights、trend、repositories、quickActions 的 mock
- 保留 `createEmptyDashboardCollections()` 用于空状态降级

## 空状态处理

- Hero：无组织时显示通用欢迎语
- KPI Grid：数据为 0 时正常显示 "0"，不隐藏
- Recent Runs：保持现有空状态（"No review activity yet" + CTA）
- Repository Health：保持现有空状态（"No repositories connected" + CTA）
- Usage Overview：无 usage 数据时显示 "No usage data yet"

## 范围边界

- 只改首页（`/`），不改其他页面
- 不改组件视觉风格，只改数据来源
- 不改 sidebar、header 等布局壳子
- 不新增 shadcn/ui 组件

## 验收标准

- 首页所有数字和列表均来自数据库真实查询
- `mock-data.ts` 中不再有被首页使用的 mock 数据
- 空状态（无仓库、无 runs、无 usage）下页面不报错
- 现有 dashboard 组件测试通过或更新
