# Dashboard 首页数据化重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data on the homepage with real database queries, remove QuickActions and RiskInsights sections, add Usage Overview section.

**Architecture:** Add 3 aggregation query functions to `@reviewer/core`, restructure `buildDashboardViewModel` to accept real data sources, create a new `DashboardUsageOverview` component, and update `page.tsx` to fetch all data concurrently and render the new layout.

**Tech Stack:** Next.js 16 App Router, TypeScript, PostgreSQL (via pg Pool), shadcn/ui, recharts, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/core/src/repositories/org-helper.ts` | Modify | Add `getOrganizationName` |
| `packages/core/src/repositories/review-run.ts` | Modify | Add `getReviewRunCount`, `getReviewRunSuccessRate` |
| `packages/core/src/repositories/review-issue.ts` | Modify | Add `getOpenFindingsCount` |
| `packages/core/src/repositories/repository.ts` | Modify | Add `getRepositoryHealthItems` |
| `apps/web/src/lib/dashboard/types.ts` | Modify | Remove `quickActions`/`insights`/`trend`, make `change` optional, add usage fields |
| `apps/web/src/lib/dashboard/view-model.ts` | Modify | Async builder with real data, remove mock imports |
| `apps/web/src/lib/dashboard/mock-data.ts` | Modify | Remove unused exports |
| `apps/web/src/components/dashboard/DashboardKpiGrid.tsx` | Modify | Make `change` badge conditional |
| `apps/web/src/components/dashboard/DashboardUsageOverview.tsx` | Create | New usage summary + chart component |
| `apps/web/src/app/page.tsx` | Modify | Fetch real data, update component tree |
| `apps/web/src/components/dashboard/dashboard-components.test.tsx` | Modify | Update tests for new structure |

---

### Task 1: Add `getReviewRunCount` and `getReviewRunSuccessRate` to core

**Files:**
- Modify: `packages/core/src/repositories/review-run.ts`

- [ ] **Step 1: Add `getReviewRunCount` function**

Append after `listRecentReviewRuns` (before the last closing brace is fine, or end of file):

```typescript
export async function getReviewRunCount(
  organizationId: string,
  sinceDays: number
): Promise<number> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ count: string }>(
      `select count(*)::bigint as count
         from public.review_runs
        where organization_id = $1
          and created_at >= now() - ($2::int * interval '1 day')`,
      [organizationId, sinceDays]
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    logger.error("Failed to count review runs", error as Error, {
      operation: "get_review_run_count",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to count review runs"
    );
  }
}
```

- [ ] **Step 2: Add `getReviewRunSuccessRate` function**

```typescript
export async function getReviewRunSuccessRate(
  organizationId: string,
  sinceDays: number
): Promise<{ total: number; succeeded: number; rate: number }> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ total: string; succeeded: string }>(
      `select
         count(*)::bigint as total,
         count(*) filter (where status = 'succeeded')::bigint as succeeded
       from public.review_runs
       where organization_id = $1
         and created_at >= now() - ($2::int * interval '1 day')`,
      [organizationId, sinceDays]
    );
    const total = Number(result.rows[0]?.total ?? 0);
    const succeeded = Number(result.rows[0]?.succeeded ?? 0);
    const rate = total > 0 ? (succeeded / total) * 100 : 0;
    return { total, succeeded, rate };
  } catch (error) {
    logger.error("Failed to compute review run success rate", error as Error, {
      operation: "get_review_run_success_rate",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to compute review run success rate"
    );
  }
}
```

- [ ] **Step 3: Verify core exports**

The functions are auto-exported via `export * from "./repositories/review-run.ts"` in `packages/core/src/index.ts`. No changes needed.

---

### Task 2: Add `getOpenFindingsCount` to core

**Files:**
- Modify: `packages/core/src/repositories/review-issue.ts`

- [ ] **Step 1: Add function**

Append to end of file:

```typescript
export async function getOpenFindingsCount(
  organizationId: string
): Promise<number> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ count: string }>(
      `select count(*)::bigint as count
         from public.review_issues
        where organization_id = $1
          and status not in ('resolved', 'ignored')`,
      [organizationId]
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    logger.error("Failed to count open findings", error as Error, {
      operation: "get_open_findings_count",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to count open findings"
    );
  }
}
```

- [ ] **Step 2: Verify export**

Auto-exported via `export * from "./repositories/review-issue.ts"` in the core index. No changes needed.

---

### Task 3: Add `getRepositoryHealthItems` to core

**Files:**
- Modify: `packages/core/src/repositories/repository.ts`

- [ ] **Step 1: Add interface and function**

Append to end of file:

```typescript
export interface RepositoryHealthRow {
  id: string;
  name: string;
  status: string;
  openFindings: number;
  lastReviewAt: Date | null;
}

export async function getRepositoryHealthItems(
  organizationId: string
): Promise<RepositoryHealthRow[]> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      id: string;
      name: string;
      status: string;
      open_findings: string;
      last_review_at: Date | null;
    }>(
      `select
         r.id, r.name, r.status,
         coalesce(
           (select count(*)::bigint
              from public.review_issues ri
             where ri.repository_id = r.id
               and ri.organization_id = r.organization_id
               and ri.status not in ('resolved', 'ignored')),
           0
         ) as open_findings,
         (select rr.created_at
            from public.review_runs rr
           where rr.repository_id = r.id
             and rr.organization_id = r.organization_id
           order by rr.created_at desc
           limit 1) as last_review_at
       from public.repositories r
       where r.organization_id = $1
         and r.status = 'active'
       order by open_findings desc, r.name asc`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      openFindings: Number(row.open_findings),
      lastReviewAt: row.last_review_at,
    }));
  } catch (error) {
    logger.error("Failed to fetch repository health items", error as Error, {
      operation: "get_repository_health_items",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to fetch repository health items"
    );
  }
}
```

---

### Task 4: Add `getOrganizationName` to core

**Files:**
- Modify: `packages/core/src/repositories/org-helper.ts`

- [ ] **Step 1: Add function**

Append to end of file:

```typescript
export async function getOrganizationName(
  orgId: string
): Promise<string | null> {
  const result = await getPool().query<{ name: string }>(
    `select name from public.organizations where id = $1 limit 1`,
    [orgId]
  );
  return result.rows[0]?.name ?? null;
}
```

---

### Task 5: Update DashboardViewModel types

**Files:**
- Modify: `apps/web/src/lib/dashboard/types.ts`

- [ ] **Step 1: Make `change` optional on `DashboardKpi`**

```typescript
export interface DashboardKpi {
  label: string;
  value: string;
  change?: string;
}
```

- [ ] **Step 2: Remove unused types and view model fields**

Remove the following exports:
- `DashboardQuickAction`
- `DashboardInsight`
- `DashboardTrendPoint`

Remove from `DashboardViewModel`:
- `quickActions: DashboardQuickAction[];`
- `insights: DashboardInsight[];`
- `trend: DashboardTrendPoint[];`

- [ ] **Step 3: Add usage fields to DashboardViewModel**

Add to `DashboardViewModel`:

```typescript
export interface DashboardUsageOverview {
  totalCalls: number;
  avgLatencyMs: number;
  dailyPoints: { label: string; value: number }[];
}
```

And add to the interface:
```typescript
usage: DashboardUsageOverview;
```

Full updated `DashboardViewModel`:
```typescript
export interface DashboardViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  hero: DashboardHeroModel;
  kpis: DashboardKpi[];
  recentRuns: DashboardRun[];
  repositories: RepositoryHealthItem[];
  usage: DashboardUsageOverview;
}
```

---

### Task 6: Update DashboardKpiGrid to handle optional change

**Files:**
- Modify: `apps/web/src/components/dashboard/DashboardKpiGrid.tsx`

- [ ] **Step 1: Make badge conditional**

Replace:
```typescript
<Badge
  variant="outline"
  className="border-emerald-200 bg-emerald-50 text-emerald-700"
>
  {kpi.change}
</Badge>
```

With:
```typescript
{kpi.change ? (
  <Badge
    variant="outline"
    className="border-emerald-200 bg-emerald-50 text-emerald-700"
  >
    {kpi.change}
  </Badge>
) : null}
```

Also adjust the `justify-between` on the parent div — when there's no badge, we don't want the empty space. Change:

```typescript
<div className="mt-2 flex items-end justify-between gap-3">
```

To:
```typescript
<div className="mt-2 flex items-end gap-3">
```

Actually — the `justify-between` still works fine with only one child. Keep it as-is, just wrap the Badge in the conditional.

---

### Task 7: Rewrite `buildDashboardViewModel`

**Files:**
- Modify: `apps/web/src/lib/dashboard/view-model.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
import type { AuthenticatedUser, ReviewRunListRow } from "@reviewer/core";
import type {
  DailyUsagePoint,
  RepositoryHealthRow,
  UsageSummary,
} from "@reviewer/core";

import { DASHBOARD_RECENT_RUNS } from "./mock-data";
import type { DashboardNavItem, DashboardRun, DashboardRunStatus, DashboardViewModel } from "./types";
import { getViewerName } from "@/lib/utils/viewer-name";
import { formatLatencyMs, formatCompactNumber } from "@/lib/usage/format";

export const DASHBOARD_NAVIGATION: DashboardNavItem[] = [
  { label: "Overview", href: "/", icon: "overview" },
  { label: "Repositories", href: "/repositories", icon: "repositories" },
  { label: "Review Runs", href: "/review-runs", icon: "runs" },
  { label: "Usage", href: "/usage", icon: "usage" },
  { label: "Webhooks", href: "/webhooks", icon: "webhooks" },
  { label: "Settings", href: "/settings/providers", icon: "settings" },
];

function cloneItems<T extends object>(items: T[]): T[] {
  return items.map((item) => ({ ...item }));
}

function mapStatus(status: string): DashboardRunStatus {
  const valid: DashboardRunStatus[] = ["running", "succeeded", "failed", "queued"];
  return valid.includes(status as DashboardRunStatus)
    ? (status as DashboardRunStatus)
    : "queued";
}

function buildSeverityLabel(row: ReviewRunListRow): string {
  if (row.securityFindingsCount > 0)
    return `${row.securityFindingsCount} security findings`;
  if (row.findingsCount > 0) return `${row.findingsCount} findings`;
  return "No findings";
}

function mapRunRowToDashboardRun(row: ReviewRunListRow): DashboardRun {
  return {
    id: row.id,
    repositoryName: row.repositoryName,
    pullRequestLabel: `PR #${row.prNumber}`,
    title: row.prTitle,
    status: mapStatus(row.status),
    startedAtLabel: row.startedAt
      ? formatRelativeLabel(row.startedAt)
      : formatRelativeLabel(row.createdAt),
    severityLabel: buildSeverityLabel(row),
  };
}

function formatRelativeLabel(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 30_000) return "Just now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function buildRepoStatus(
  row: RepositoryHealthRow
): "connected" | "attention" | "pending" {
  if (row.openFindings > 0) return "attention";
  return "connected";
}

function buildLastReviewLabel(lastReviewAt: Date | null): string {
  if (!lastReviewAt) return "No reviews yet";
  return `Last review ${formatRelativeLabel(lastReviewAt)}`;
}

function shortDay(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export interface BuildDashboardInput {
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string };
  orgName: string;
  recentRunRows?: ReviewRunListRow[];
  repoCount: number;
  reviewRunCount: number;
  openFindingsCount: number;
  successRate: number;
  repoHealthRows: RepositoryHealthRow[];
  usageSummary: UsageSummary;
  usageDaily: DailyUsagePoint[];
}

export function buildDashboardViewModel(
  input: BuildDashboardInput
): DashboardViewModel {
  const runs = input.recentRunRows
    ? input.recentRunRows.map(mapRunRowToDashboardRun)
    : cloneItems(DASHBOARD_RECENT_RUNS);

  return {
    shell: {
      workspaceName: "Acme Engineering",
      currentPath: "/",
      logoutHref: "/api/auth/logout",
      navigation: cloneItems(DASHBOARD_NAVIGATION),
    },
    topbar: {
      title: "Overview",
      summary: "",
      searchPlaceholder: "Search repositories, runs, or rules",
      rangeLabel: "Last 7 days",
    },
    hero: {
      organizationName: input.orgName,
      viewerName: getViewerName(input.user),
      title: "Your review workspace is in motion.",
      summary:
        "Track repository health, continue active reviews, and surface the findings that need attention first.",
    },
    kpis: [
      { label: "Active Repositories", value: String(input.repoCount) },
      {
        label: "Reviews This Week",
        value: String(input.reviewRunCount),
      },
      {
        label: "Open Findings",
        value: String(input.openFindingsCount),
      },
      {
        label: "Success Rate",
        value: `${input.successRate.toFixed(1)}%`,
      },
    ],
    recentRuns: runs,
    repositories: input.repoHealthRows.map((row) => ({
      id: row.id,
      name: row.name,
      openFindings: row.openFindings,
      lastReviewLabel: buildLastReviewLabel(row.lastReviewAt),
      status: buildRepoStatus(row),
    })),
    usage: {
      totalCalls: input.usageSummary.totalCalls,
      avgLatencyMs: input.usageSummary.avgLatencyMs,
      dailyPoints: input.usageDaily.map((p) => ({
        label: shortDay(p.day),
        value: p.calls,
      })),
    },
  };
}
```

---

### Task 8: Clean up mock-data.ts

**Files:**
- Modify: `apps/web/src/lib/dashboard/mock-data.ts`

- [ ] **Step 1: Remove unused exports**

Delete these exports and their data:
- `DASHBOARD_KPIS`
- `DASHBOARD_QUICK_ACTIONS`
- `DASHBOARD_INSIGHTS`
- `DASHBOARD_TREND`
- `DASHBOARD_REPOSITORIES`

Keep:
- `DASHBOARD_RECENT_RUNS` (still used as fallback in view-model when no runs)
- `createEmptyDashboardCollections()`

Also remove unused type imports from the top:
```typescript
import type { DashboardRun } from "./types";

export const DASHBOARD_RECENT_RUNS: DashboardRun[] = [
  // ... keep as-is
];

export function createEmptyDashboardCollections() {
  return {
    recentRuns: [] as DashboardRun[],
    repositories: [] as RepositoryHealthItem[],
  };
}
```

Import `RepositoryHealthItem` from `./types` at the top since `createEmptyDashboardCollections` still uses it.

---

### Task 9: Create `DashboardUsageOverview` component

**Files:**
- Create: `apps/web/src/components/dashboard/DashboardUsageOverview.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardUsageOverview } from "@/lib/dashboard/types";
import { formatCompactNumber, formatLatencyMs } from "@/lib/usage/format";

export default function DashboardUsageOverview({
  usage,
}: {
  usage: DashboardUsageOverview;
}) {
  if (usage.totalCalls === 0 && usage.dailyPoints.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No usage data yet. AI call metrics will appear here after your first review.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-0">
        <CardTitle className="text-base tracking-[-0.03em]">
          Usage overview
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Last 7 days AI call activity
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="h-48 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={usage.dailyPoints}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickMargin={6}
                />
                <YAxis
                  tickFormatter={(value) => {
                    const v = typeof value === "number" ? value : 0;
                    return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
                  }}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => {
                    const v = typeof value === "number" ? value : 0;
                    return [v.toLocaleString(), "Calls"];
                  }}
                  labelClassName="text-xs text-slate-500"
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#e5e7eb",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-row gap-6 lg:flex-col lg:justify-center">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Total calls
              </div>
              <div className="mt-0.5 text-2xl font-semibold tracking-tight">
                {formatCompactNumber(usage.totalCalls)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Avg latency
              </div>
              <div className="mt-0.5 text-2xl font-semibold tracking-tight">
                {formatLatencyMs(usage.avgLatencyMs)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

### Task 10: Update `page.tsx`

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Replace the file**

```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getOrganizationName,
  getSessionUser,
  listRecentReviewRuns,
  listRepositoriesByOrganization,
  getReviewRunCount,
  getReviewRunSuccessRate,
  getOpenFindingsCount,
  getRepositoryHealthItems,
  getUsageSummary,
  getDailyUsageStats,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import DashboardHero from "@/components/dashboard/DashboardHero";
import DashboardKpiGrid from "@/components/dashboard/DashboardKpiGrid";
import RecentReviewRuns from "@/components/dashboard/RecentReviewRuns";
import RepositoryHealthList from "@/components/dashboard/RepositoryHealthList";
import DashboardUsageOverview from "@/components/dashboard/DashboardUsageOverview";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);

  if (!orgId) {
    // No org — render with empty data
    const dashboard = buildDashboardViewModel({
      user,
      orgName: "Reviewer",
      repoCount: 0,
      reviewRunCount: 0,
      openFindingsCount: 0,
      successRate: 0,
      repoHealthRows: [],
      usageSummary: {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        truncatedCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
      },
      usageDaily: [],
    });

    return (
      <AdminShell
        shell={dashboard.shell}
        topbar={dashboard.topbar}
        viewerName={dashboard.hero.viewerName}
      >
        <div className="space-y-4">
          <DashboardHero hero={dashboard.hero} />
        </div>
      </AdminShell>
    );
  }

  const [
    orgName,
    recentRunRows,
    repoRows,
    reviewRunCount,
    { rate: successRate },
    openFindingsCount,
    repoHealthRows,
    usageSummary,
    usageDaily,
  ] = await Promise.all([
    getOrganizationName(orgId),
    listRecentReviewRuns(orgId, 5),
    listRepositoriesByOrganization(orgId),
    getReviewRunCount(orgId, 7),
    getReviewRunSuccessRate(orgId, 7),
    getOpenFindingsCount(orgId),
    getRepositoryHealthItems(orgId),
    getUsageSummary(orgId, 7),
    getDailyUsageStats(orgId, 7),
  ]);

  const dashboard = buildDashboardViewModel({
    user,
    orgName: orgName ?? "Reviewer",
    recentRunRows,
    repoCount: repoRows.length,
    reviewRunCount,
    openFindingsCount,
    successRate,
    repoHealthRows,
    usageSummary,
    usageDaily,
  });

  return (
    <AdminShell
      shell={dashboard.shell}
      topbar={dashboard.topbar}
      viewerName={dashboard.hero.viewerName}
    >
      <div className="space-y-4">
        <DashboardHero hero={dashboard.hero} />
        <DashboardKpiGrid kpis={dashboard.kpis} />
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <RecentReviewRuns runs={dashboard.recentRuns} />
          <RepositoryHealthList repositories={dashboard.repositories} />
        </div>
        <DashboardUsageOverview usage={dashboard.usage} />
      </div>
    </AdminShell>
  );
}
```

---

### Task 11: Update tests

**Files:**
- Modify: `apps/web/src/components/dashboard/dashboard-components.test.tsx`

- [ ] **Step 1: Read current test file and update for new structure**

Read the current test file, then update:
- Remove tests for `DashboardQuickActions` and `RiskInsights`
- Add test for `DashboardUsageOverview`
- Update view model usage in setup to match new `BuildDashboardInput` interface
- Ensure `DashboardKpiGrid` tests work with optional `change`

---

### Task 12: Build and verify

- [ ] **Step 1: Type check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 2: Run tests**

```bash
cd apps/web && npm test -- --run
```

- [ ] **Step 3: Build**

```bash
cd apps/web && npm run build
```

- [ ] **Step 4: Fix any type errors or test failures**

---

### Task 13: Commit

```bash
git add packages/core/src/repositories/org-helper.ts \
        packages/core/src/repositories/review-run.ts \
        packages/core/src/repositories/review-issue.ts \
        packages/core/src/repositories/repository.ts \
        apps/web/src/lib/dashboard/types.ts \
        apps/web/src/lib/dashboard/view-model.ts \
        apps/web/src/lib/dashboard/mock-data.ts \
        apps/web/src/components/dashboard/DashboardKpiGrid.tsx \
        apps/web/src/components/dashboard/DashboardUsageOverview.tsx \
        apps/web/src/app/page.tsx \
        apps/web/src/components/dashboard/dashboard-components.test.tsx

git commit -m "feat: replace dashboard mock data with real database queries / 首页 mock 数据替换为真实数据库查询

Remove QuickActions and RiskInsights sections. Add Usage Overview with
daily calls chart. All KPI, repository health, and usage data now comes
from real database aggregations."
```
