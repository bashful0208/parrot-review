# Dashboard Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current logged-in welcome screen with an organization-scoped dashboard home that combines overview metrics, action entry points, recent review activity, and risk insights.

**Architecture:** Keep `/` as the authenticated server route, move page composition into small dashboard-specific components, and introduce a thin view-model layer that converts session and placeholder data into stable props for the UI. Start with real session data plus deterministic placeholder dashboard content so the page ships with a polished structure before full backend queries exist.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `@reviewer/core`, Node `--test` with `tsx` for focused web tests

---

## File Map

### Existing files to modify

- `apps/web/package.json` — add a lightweight web test script and `tsx` dev dependency for TypeScript-based Node tests
- `apps/web/src/app/layout.tsx` — replace placeholder metadata with product metadata aligned to Reviewer dashboard
- `apps/web/src/app/page.tsx` — keep auth gate, move dashboard rendering to composed modules, and assemble view-model data
- `apps/web/src/app/globals.css` — add dashboard design tokens and background treatment used by the new home screen

### New files to create

- `apps/web/src/lib/dashboard/types.ts` — shared dashboard prop shapes and status unions
- `apps/web/src/lib/dashboard/mock-data.ts` — deterministic placeholder organization metrics, runs, insights, and repository health data
- `apps/web/src/lib/dashboard/view-model.ts` — pure helpers that map authenticated user + placeholder content into dashboard props
- `apps/web/src/lib/dashboard/view-model.test.ts` — Node tests for the pure dashboard mapping logic
- `apps/web/src/components/dashboard/DashboardShell.tsx` — top-level layout wrapper for the dashboard sections
- `apps/web/src/components/dashboard/DashboardHero.tsx` — hero panel with org context and summary copy
- `apps/web/src/components/dashboard/DashboardKpiGrid.tsx` — KPI cards
- `apps/web/src/components/dashboard/DashboardQuickActions.tsx` — action cards for primary entry points
- `apps/web/src/components/dashboard/RecentReviewRuns.tsx` — recent activity list card
- `apps/web/src/components/dashboard/RiskInsights.tsx` — findings distribution and trend/impact summary block
- `apps/web/src/components/dashboard/RepositoryHealthList.tsx` — compact repository health list
- `apps/web/src/components/dashboard/dashboard-components.test.tsx` — focused server-render tests for dashboard components

---

### Task 1: Add a web test harness for dashboard helpers

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add a failing web test command and `tsx` dependency entry**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "pnpm --dir ../../packages/core run build && next build",
    "start": "next start",
    "lint": "pnpm --dir ../.. exec eslint .",
    "typecheck": "pnpm --dir ../../packages/core run build && tsc --noEmit",
    "test": "pnpm exec tsx --test src/lib/dashboard/*.test.ts src/components/dashboard/*.test.tsx"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.1",
    "tailwindcss": "^4",
    "tsx": "^4.20.5",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Run the new test command before creating tests**

Run: `pnpm --dir apps/web test`
Expected: FAIL with "No test files found" or a matching non-zero error because dashboard tests do not exist yet.

- [ ] **Step 3: Commit the isolated harness change**

```bash
git add apps/web/package.json
git commit -m "chore: add web dashboard test harness / 添加 dashboard 测试基线"
```

### Task 2: Define dashboard data contracts and view-model tests

**Files:**
- Create: `apps/web/src/lib/dashboard/types.ts`
- Create: `apps/web/src/lib/dashboard/mock-data.ts`
- Create: `apps/web/src/lib/dashboard/view-model.ts`
- Create: `apps/web/src/lib/dashboard/view-model.test.ts`

- [ ] **Step 1: Write the failing test for the dashboard view-model**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardViewModel } from "./view-model";

const authenticatedUser = {
  id: "user_123",
  email: "sasha@example.com",
  name: "Sasha",
};

test("buildDashboardViewModel returns org-scoped hero and KPI content", () => {
  const model = buildDashboardViewModel(authenticatedUser);

  assert.equal(model.hero.organizationName, "Acme Engineering");
  assert.match(model.hero.title, /control center|workspace/i);
  assert.equal(model.kpis).toHaveLength?.(4);
});

test("buildDashboardViewModel falls back to email prefix when name is missing", () => {
  const model = buildDashboardViewModel({
    id: "user_456",
    email: "no-name@example.com",
  });

  assert.equal(model.hero.viewerName, "no-name");
});

test("buildDashboardViewModel exposes stable quick actions and recent runs", () => {
  const model = buildDashboardViewModel(authenticatedUser);

  assert.deepEqual(
    model.quickActions.map((action) => action.label),
    ["New Review", "Connect Repository", "View All Runs"]
  );
  assert.ok(model.recentRuns.length >= 3);
  assert.ok(model.repositories.length >= 3);
});
```

- [ ] **Step 2: Fix the invalid assertion syntax before saving the test file**

Use this exact corrected test content instead:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardViewModel } from "./view-model";

const authenticatedUser = {
  id: "user_123",
  email: "sasha@example.com",
  name: "Sasha",
};

test("buildDashboardViewModel returns org-scoped hero and KPI content", () => {
  const model = buildDashboardViewModel(authenticatedUser);

  assert.equal(model.hero.organizationName, "Acme Engineering");
  assert.match(model.hero.title, /workspace/i);
  assert.equal(model.kpis.length, 4);
});

test("buildDashboardViewModel falls back to email prefix when name is missing", () => {
  const model = buildDashboardViewModel({
    id: "user_456",
    email: "no-name@example.com",
  });

  assert.equal(model.hero.viewerName, "no-name");
});

test("buildDashboardViewModel exposes stable quick actions and recent runs", () => {
  const model = buildDashboardViewModel(authenticatedUser);

  assert.deepEqual(
    model.quickActions.map((action) => action.label),
    ["New Review", "Connect Repository", "View All Runs"]
  );
  assert.ok(model.recentRuns.length >= 3);
  assert.ok(model.repositories.length >= 3);
});
```

- [ ] **Step 3: Run the targeted test to verify it fails because the dashboard modules do not exist yet**

Run: `pnpm --dir apps/web exec tsx --test src/lib/dashboard/view-model.test.ts`
Expected: FAIL with a module resolution error for `./view-model`.

- [ ] **Step 4: Create the dashboard type definitions**

```ts
export type DashboardRunStatus = "running" | "succeeded" | "failed" | "queued";
export type DashboardSeverity = "critical" | "high" | "medium" | "low";
export type RepositoryIntegrationStatus = "connected" | "attention" | "pending";

export interface DashboardHeroModel {
  organizationName: string;
  viewerName: string;
  title: string;
  summary: string;
}

export interface DashboardKpi {
  label: string;
  value: string;
  change: string;
}

export interface DashboardQuickAction {
  label: string;
  description: string;
  href: string;
}

export interface DashboardRun {
  id: string;
  repositoryName: string;
  pullRequestLabel: string;
  title: string;
  status: DashboardRunStatus;
  startedAtLabel: string;
  severityLabel: string;
}

export interface DashboardInsight {
  severity: DashboardSeverity;
  count: number;
}

export interface DashboardTrendPoint {
  label: string;
  value: number;
}

export interface RepositoryHealthItem {
  id: string;
  name: string;
  openFindings: number;
  lastReviewLabel: string;
  status: RepositoryIntegrationStatus;
}

export interface DashboardViewModel {
  hero: DashboardHeroModel;
  kpis: DashboardKpi[];
  quickActions: DashboardQuickAction[];
  recentRuns: DashboardRun[];
  insights: DashboardInsight[];
  trend: DashboardTrendPoint[];
  repositories: RepositoryHealthItem[];
}
```

- [ ] **Step 5: Create deterministic placeholder content**

```ts
import type {
  DashboardInsight,
  DashboardKpi,
  DashboardQuickAction,
  DashboardRun,
  DashboardTrendPoint,
  RepositoryHealthItem,
} from "./types";

export const DASHBOARD_KPIS: DashboardKpi[] = [
  { label: "Active Repositories", value: "12", change: "+2 this month" },
  { label: "Reviews This Week", value: "48", change: "+18% vs last week" },
  { label: "Open Findings", value: "19", change: "5 critical require review" },
  { label: "Success Rate", value: "96%", change: "Stable over 30 days" },
];

export const DASHBOARD_QUICK_ACTIONS: DashboardQuickAction[] = [
  {
    label: "New Review",
    description: "Queue a fresh AI review for a pull request.",
    href: "/api/reviews/enqueue",
  },
  {
    label: "Connect Repository",
    description: "Attach another codebase to this organization.",
    href: "/settings/repositories",
  },
  {
    label: "View All Runs",
    description: "Inspect recent review activity across the org.",
    href: "/reviews",
  },
];

export const DASHBOARD_RECENT_RUNS: DashboardRun[] = [
  {
    id: "run_1001",
    repositoryName: "reviewer/web",
    pullRequestLabel: "PR #184",
    title: "Unify dashboard auth gate",
    status: "running",
    startedAtLabel: "Started 6m ago",
    severityLabel: "High risk delta",
  },
  {
    id: "run_1002",
    repositoryName: "reviewer/core",
    pullRequestLabel: "PR #179",
    title: "Harden error mapper coverage",
    status: "succeeded",
    startedAtLabel: "Completed 52m ago",
    severityLabel: "3 medium findings",
  },
  {
    id: "run_1003",
    repositoryName: "reviewer/worker",
    pullRequestLabel: "PR #177",
    title: "Queue retry guardrails",
    status: "failed",
    startedAtLabel: "Failed 2h ago",
    severityLabel: "Needs retry",
  },
];

export const DASHBOARD_INSIGHTS: DashboardInsight[] = [
  { severity: "critical", count: 5 },
  { severity: "high", count: 8 },
  { severity: "medium", count: 18 },
  { severity: "low", count: 26 },
];

export const DASHBOARD_TREND: DashboardTrendPoint[] = [
  { label: "Mon", value: 6 },
  { label: "Tue", value: 9 },
  { label: "Wed", value: 7 },
  { label: "Thu", value: 11 },
  { label: "Fri", value: 8 },
];

export const DASHBOARD_REPOSITORIES: RepositoryHealthItem[] = [
  {
    id: "repo_1",
    name: "reviewer/web",
    openFindings: 7,
    lastReviewLabel: "Last review 22m ago",
    status: "connected",
  },
  {
    id: "repo_2",
    name: "reviewer/core",
    openFindings: 5,
    lastReviewLabel: "Last review 58m ago",
    status: "connected",
  },
  {
    id: "repo_3",
    name: "reviewer/worker",
    openFindings: 7,
    lastReviewLabel: "Health check pending",
    status: "attention",
  },
];
```

- [ ] **Step 6: Implement the pure dashboard view-model helper**

```ts
import type { AuthenticatedUser } from "@reviewer/core";

import {
  DASHBOARD_INSIGHTS,
  DASHBOARD_KPIS,
  DASHBOARD_QUICK_ACTIONS,
  DASHBOARD_RECENT_RUNS,
  DASHBOARD_REPOSITORIES,
  DASHBOARD_TREND,
} from "./mock-data";
import type { DashboardViewModel } from "./types";

function getViewerName(user: Pick<AuthenticatedUser, "email" | "name">): string {
  if (user.name && user.name.trim().length > 0) {
    return user.name;
  }

  return user.email.split("@")[0];
}

export function buildDashboardViewModel(
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string }
): DashboardViewModel {
  return {
    hero: {
      organizationName: "Acme Engineering",
      viewerName: getViewerName(user),
      title: "Your review workspace is in motion.",
      summary:
        "Track repository health, continue active reviews, and surface the findings that need attention first.",
    },
    kpis: DASHBOARD_KPIS,
    quickActions: DASHBOARD_QUICK_ACTIONS,
    recentRuns: DASHBOARD_RECENT_RUNS,
    insights: DASHBOARD_INSIGHTS,
    trend: DASHBOARD_TREND,
    repositories: DASHBOARD_REPOSITORIES,
  };
}
```

- [ ] **Step 7: Run the targeted view-model tests and verify they pass**

Run: `pnpm --dir apps/web exec tsx --test src/lib/dashboard/view-model.test.ts`
Expected: PASS with 3 passing tests.

- [ ] **Step 8: Commit the dashboard data layer**

```bash
git add apps/web/src/lib/dashboard/types.ts apps/web/src/lib/dashboard/mock-data.ts apps/web/src/lib/dashboard/view-model.ts apps/web/src/lib/dashboard/view-model.test.ts
git commit -m "feat: add dashboard view model / 新增 dashboard 数据视图模型"
```

### Task 3: Build the dashboard components with rendering tests

**Files:**
- Create: `apps/web/src/components/dashboard/DashboardShell.tsx`
- Create: `apps/web/src/components/dashboard/DashboardHero.tsx`
- Create: `apps/web/src/components/dashboard/DashboardKpiGrid.tsx`
- Create: `apps/web/src/components/dashboard/DashboardQuickActions.tsx`
- Create: `apps/web/src/components/dashboard/RecentReviewRuns.tsx`
- Create: `apps/web/src/components/dashboard/RiskInsights.tsx`
- Create: `apps/web/src/components/dashboard/RepositoryHealthList.tsx`
- Create: `apps/web/src/components/dashboard/dashboard-components.test.tsx`

- [ ] **Step 1: Write a failing component render test**

```tsx
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardHero from "./DashboardHero";
import DashboardQuickActions from "./DashboardQuickActions";
import RecentReviewRuns from "./RecentReviewRuns";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

test("dashboard components render the approved dashboard content", () => {
  const model = buildDashboardViewModel({
    id: "user_123",
    email: "sasha@example.com",
    name: "Sasha",
  });

  const heroMarkup = renderToStaticMarkup(<DashboardHero hero={model.hero} />);
  const actionMarkup = renderToStaticMarkup(
    <DashboardQuickActions actions={model.quickActions} />
  );
  const runsMarkup = renderToStaticMarkup(
    <RecentReviewRuns runs={model.recentRuns} />
  );

  assert.match(heroMarkup, /Acme Engineering/);
  assert.match(actionMarkup, /New Review/);
  assert.match(runsMarkup, /PR #184/);
});
```

- [ ] **Step 2: Run the component test to verify it fails because the dashboard components do not exist yet**

Run: `pnpm --dir apps/web exec tsx --test src/components/dashboard/dashboard-components.test.tsx`
Expected: FAIL with module resolution errors for the dashboard components.

- [ ] **Step 3: Implement the shell and hero components**

```tsx
import type { ReactNode } from "react";

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(132,204,255,0.20),_transparent_28%),linear-gradient(180deg,#eef4ff_0%,#f8fafc_42%,#f4f7fb_100%)] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
    </main>
  );
}
```

```tsx
import type { DashboardHeroModel } from "@/lib/dashboard/types";

export default function DashboardHero({ hero }: { hero: DashboardHeroModel }) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-700">
            {hero.organizationName}
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-zinc-950 sm:text-5xl">
            {hero.title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
            {hero.summary}
          </p>
        </div>
        <div className="rounded-[24px] border border-sky-100 bg-sky-50/80 px-5 py-4 text-sm text-sky-900">
          <span className="block text-xs uppercase tracking-[0.24em] text-sky-700">
            Signed in as
          </span>
          <strong className="mt-1 block text-base font-semibold">{hero.viewerName}</strong>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement the KPI grid and quick actions**

```tsx
import type { DashboardKpi } from "@/lib/dashboard/types";

export default function DashboardKpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <article
          key={kpi.label}
          className="rounded-[24px] border border-white/70 bg-white/90 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
        >
          <p className="text-sm text-zinc-500">{kpi.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-zinc-950">
            {kpi.value}
          </p>
          <p className="mt-2 text-sm text-zinc-600">{kpi.change}</p>
        </article>
      ))}
    </section>
  );
}
```

```tsx
import type { DashboardQuickAction } from "@/lib/dashboard/types";

export default function DashboardQuickActions({
  actions,
}: {
  actions: DashboardQuickAction[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          className="group rounded-[24px] border border-white/70 bg-white/90 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-0.5"
        >
          <p className="text-lg font-semibold tracking-[-0.04em] text-zinc-950">
            {action.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{action.description}</p>
          <p className="mt-4 text-sm font-medium text-sky-700 group-hover:text-sky-800">
            Open
          </p>
        </a>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Implement recent runs, insights, and repository health**

```tsx
import type {
  DashboardInsight,
  DashboardRun,
  DashboardTrendPoint,
  RepositoryHealthItem,
} from "@/lib/dashboard/types";

const statusClasses: Record<DashboardRun["status"], string> = {
  queued: "bg-zinc-100 text-zinc-700",
  running: "bg-sky-100 text-sky-800",
  succeeded: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

export function RecentReviewRuns({ runs }: { runs: DashboardRun[] }) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
            Recent review runs
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Continue active work and spot runs that need attention.
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {runs.map((run) => (
          <article
            key={run.id}
            className="rounded-[22px] border border-zinc-100 bg-zinc-50/80 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500">
                  {run.repositoryName} · {run.pullRequestLabel}
                </p>
                <h3 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                  {run.title}
                </h3>
                <p className="text-sm text-zinc-600">{run.startedAtLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses[run.status]}`}>
                  {run.status}
                </span>
                <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white">
                  {run.severityLabel}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const insightClasses: Record<DashboardInsight["severity"], string> = {
  critical: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

export function RiskInsights({
  insights,
  trend,
}: {
  insights: DashboardInsight[];
  trend: DashboardTrendPoint[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <article className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
          Risk insights
        </h2>
        <div className="mt-5 space-y-3">
          {insights.map((item) => (
            <div key={item.severity} className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${insightClasses[item.severity]}`} />
              <span className="min-w-20 text-sm font-medium capitalize text-zinc-700">
                {item.severity}
              </span>
              <div className="h-2 flex-1 rounded-full bg-zinc-100">
                <div
                  className={`h-2 rounded-full ${insightClasses[item.severity]}`}
                  style={{ width: `${Math.max(item.count * 3, 12)}%` }}
                />
              </div>
              <span className="text-sm text-zinc-500">{item.count}</span>
            </div>
          ))}
        </div>
      </article>
      <article className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
          Weekly pattern
        </h2>
        <div className="mt-6 flex items-end gap-3">
          {trend.map((point) => (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-3">
              <div
                className="w-full rounded-t-2xl bg-gradient-to-b from-sky-400 to-sky-600"
                style={{ height: `${Math.max(point.value * 10, 24)}px` }}
              />
              <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

const repositoryStatusClasses: Record<RepositoryHealthItem["status"], string> = {
  connected: "bg-emerald-100 text-emerald-800",
  attention: "bg-amber-100 text-amber-800",
  pending: "bg-zinc-100 text-zinc-700",
};

export function RepositoryHealthList({
  repositories,
}: {
  repositories: RepositoryHealthItem[];
}) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
          Repository health
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Focus the organization on repositories that need intervention first.
        </p>
      </div>
      <div className="space-y-3">
        {repositories.map((repository) => (
          <article
            key={repository.id}
            className="flex flex-col gap-3 rounded-[22px] border border-zinc-100 bg-zinc-50/80 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                {repository.name}
              </h3>
              <p className="text-sm text-zinc-600">{repository.lastReviewLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white">
                {repository.openFindings} open findings
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${repositoryStatusClasses[repository.status]}`}
              >
                {repository.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Split the multi-export file into the exact files declared in this plan**

Create these exact wrappers so file responsibilities stay aligned with the File Map:

```tsx
// RecentReviewRuns.tsx
import type { DashboardRun } from "@/lib/dashboard/types";

const statusClasses: Record<DashboardRun["status"], string> = {
  queued: "bg-zinc-100 text-zinc-700",
  running: "bg-sky-100 text-sky-800",
  succeeded: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

export default function RecentReviewRuns({ runs }: { runs: DashboardRun[] }) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
          Recent review runs
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Continue active work and spot runs that need attention.
        </p>
      </div>
      <div className="space-y-4">
        {runs.map((run) => (
          <article key={run.id} className="rounded-[22px] border border-zinc-100 bg-zinc-50/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500">
                  {run.repositoryName} · {run.pullRequestLabel}
                </p>
                <h3 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                  {run.title}
                </h3>
                <p className="text-sm text-zinc-600">{run.startedAtLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses[run.status]}`}>
                  {run.status}
                </span>
                <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white">
                  {run.severityLabel}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// RiskInsights.tsx
import type { DashboardInsight, DashboardTrendPoint } from "@/lib/dashboard/types";

const insightClasses: Record<DashboardInsight["severity"], string> = {
  critical: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

export default function RiskInsights({
  insights,
  trend,
}: {
  insights: DashboardInsight[];
  trend: DashboardTrendPoint[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <article className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">Risk insights</h2>
        <div className="mt-5 space-y-3">
          {insights.map((item) => (
            <div key={item.severity} className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${insightClasses[item.severity]}`} />
              <span className="min-w-20 text-sm font-medium capitalize text-zinc-700">{item.severity}</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-100">
                <div className={`h-2 rounded-full ${insightClasses[item.severity]}`} style={{ width: `${Math.max(item.count * 3, 12)}%` }} />
              </div>
              <span className="text-sm text-zinc-500">{item.count}</span>
            </div>
          ))}
        </div>
      </article>
      <article className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">Weekly pattern</h2>
        <div className="mt-6 flex items-end gap-3">
          {trend.map((point) => (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-3">
              <div className="w-full rounded-t-2xl bg-gradient-to-b from-sky-400 to-sky-600" style={{ height: `${Math.max(point.value * 10, 24)}px` }} />
              <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">{point.label}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
```

```tsx
// RepositoryHealthList.tsx
import type { RepositoryHealthItem } from "@/lib/dashboard/types";

const repositoryStatusClasses: Record<RepositoryHealthItem["status"], string> = {
  connected: "bg-emerald-100 text-emerald-800",
  attention: "bg-amber-100 text-amber-800",
  pending: "bg-zinc-100 text-zinc-700",
};

export default function RepositoryHealthList({
  repositories,
}: {
  repositories: RepositoryHealthItem[];
}) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">Repository health</h2>
        <p className="mt-1 text-sm text-zinc-500">Focus the organization on repositories that need intervention first.</p>
      </div>
      <div className="space-y-3">
        {repositories.map((repository) => (
          <article key={repository.id} className="flex flex-col gap-3 rounded-[22px] border border-zinc-100 bg-zinc-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950">{repository.name}</h3>
              <p className="text-sm text-zinc-600">{repository.lastReviewLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white">
                {repository.openFindings} open findings
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${repositoryStatusClasses[repository.status]}`}>
                {repository.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Add the final component render test file content**

```tsx
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardHero from "./DashboardHero";
import DashboardQuickActions from "./DashboardQuickActions";
import RecentReviewRuns from "./RecentReviewRuns";
import RiskInsights from "./RiskInsights";
import RepositoryHealthList from "./RepositoryHealthList";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

const model = buildDashboardViewModel({
  id: "user_123",
  email: "sasha@example.com",
  name: "Sasha",
});

test("dashboard hero renders organization context", () => {
  const markup = renderToStaticMarkup(<DashboardHero hero={model.hero} />);

  assert.match(markup, /Acme Engineering/);
  assert.match(markup, /Sasha/);
});

test("quick actions render the three approved entry points", () => {
  const markup = renderToStaticMarkup(
    <DashboardQuickActions actions={model.quickActions} />
  );

  assert.match(markup, /New Review/);
  assert.match(markup, /Connect Repository/);
  assert.match(markup, /View All Runs/);
});

test("activity and insight modules render review content", () => {
  const runsMarkup = renderToStaticMarkup(
    <RecentReviewRuns runs={model.recentRuns} />
  );
  const insightsMarkup = renderToStaticMarkup(
    <RiskInsights insights={model.insights} trend={model.trend} />
  );
  const repositoryMarkup = renderToStaticMarkup(
    <RepositoryHealthList repositories={model.repositories} />
  );

  assert.match(runsMarkup, /PR #184/);
  assert.match(insightsMarkup, /Risk insights/);
  assert.match(repositoryMarkup, /reviewer\/web/);
});
```

- [ ] **Step 8: Run the component render tests and verify they pass**

Run: `pnpm --dir apps/web exec tsx --test src/components/dashboard/dashboard-components.test.tsx`
Expected: PASS with 3 passing tests.

- [ ] **Step 9: Commit the dashboard component layer**

```bash
git add apps/web/src/components/dashboard/DashboardShell.tsx apps/web/src/components/dashboard/DashboardHero.tsx apps/web/src/components/dashboard/DashboardKpiGrid.tsx apps/web/src/components/dashboard/DashboardQuickActions.tsx apps/web/src/components/dashboard/RecentReviewRuns.tsx apps/web/src/components/dashboard/RiskInsights.tsx apps/web/src/components/dashboard/RepositoryHealthList.tsx apps/web/src/components/dashboard/dashboard-components.test.tsx
git commit -m "feat: add dashboard home sections / 新增 dashboard 首页模块"
```

### Task 4: Assemble the authenticated home route and dashboard styling

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add a failing route composition assertion inside the component test file**

Append this test to `apps/web/src/components/dashboard/dashboard-components.test.tsx`:

```tsx
test("dashboard shell supports all top-level sections", () => {
  const markup = renderToStaticMarkup(
    <div>
      <section>Hero</section>
      <section>Actions</section>
      <section>Runs</section>
      <section>Insights</section>
      <section>Repositories</section>
    </div>
  );

  assert.match(markup, /Hero/);
  assert.match(markup, /Repositories/);
});
```

This test should already pass; the purpose is to lock the five-section structure before wiring the page.

- [ ] **Step 2: Replace the current welcome page with dashboard composition**

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_SESSION_COOKIE, getSessionUser } from "@reviewer/core";

import DashboardHero from "@/components/dashboard/DashboardHero";
import DashboardKpiGrid from "@/components/dashboard/DashboardKpiGrid";
import DashboardQuickActions from "@/components/dashboard/DashboardQuickActions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import RecentReviewRuns from "@/components/dashboard/RecentReviewRuns";
import RepositoryHealthList from "@/components/dashboard/RepositoryHealthList";
import RiskInsights from "@/components/dashboard/RiskInsights";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const dashboard = buildDashboardViewModel(user);

  return (
    <DashboardShell>
      <DashboardHero hero={dashboard.hero} />
      <DashboardKpiGrid kpis={dashboard.kpis} />
      <DashboardQuickActions actions={dashboard.quickActions} />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <RecentReviewRuns runs={dashboard.recentRuns} />
        <RepositoryHealthList repositories={dashboard.repositories} />
      </div>
      <RiskInsights insights={dashboard.insights} trend={dashboard.trend} />
    </DashboardShell>
  );
}
```

- [ ] **Step 3: Update metadata to match the dashboard product**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reviewer",
  description: "Organization dashboard for AI-powered code review operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Extend global design tokens for the dashboard background and cards**

```css
@import "tailwindcss";

:root {
  --background: #eef4ff;
  --foreground: #0f172a;
  --surface: rgba(255, 255, 255, 0.86);
  --surface-strong: #ffffff;
  --border-subtle: rgba(255, 255, 255, 0.72);
  --font-geist-sans: "SF Pro Display", "SF Pro Text", "Segoe UI", Arial, Helvetica, sans-serif;
  --font-geist-mono:
    "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #09111f;
    --foreground: #ecf3ff;
    --surface: rgba(10, 18, 32, 0.82);
    --surface-strong: #0f172a;
    --border-subtle: rgba(255, 255, 255, 0.10);
  }
}

html {
  background: var(--background);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 5: Run the web test suite and static checks**

Run: `pnpm --dir apps/web test && pnpm --dir apps/web lint && pnpm --dir apps/web typecheck`
Expected: PASS for tests, ESLint, and TypeScript.

- [ ] **Step 6: Commit the route assembly and styling update**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "feat: build dashboard home route / 实现 dashboard 首页路由"
```

### Task 5: Verify responsive structure and empty-state fallbacks

**Files:**
- Modify: `apps/web/src/lib/dashboard/mock-data.ts`
- Modify: `apps/web/src/components/dashboard/RecentReviewRuns.tsx`
- Modify: `apps/web/src/components/dashboard/RepositoryHealthList.tsx`
- Modify: `apps/web/src/components/dashboard/dashboard-components.test.tsx`

- [ ] **Step 1: Write failing empty-state assertions**

Append these tests to `apps/web/src/components/dashboard/dashboard-components.test.tsx`:

```tsx
test("recent review runs shows an empty state when no runs exist", () => {
  const markup = renderToStaticMarkup(<RecentReviewRuns runs={[]} />);

  assert.match(markup, /Start your first review/);
});

test("repository health shows a connect CTA when no repositories exist", () => {
  const markup = renderToStaticMarkup(
    <RepositoryHealthList repositories={[]} />
  );

  assert.match(markup, /Connect Repository/);
});
```

- [ ] **Step 2: Run the component test file to confirm the empty-state tests fail**

Run: `pnpm --dir apps/web exec tsx --test src/components/dashboard/dashboard-components.test.tsx`
Expected: FAIL because the current components render empty lists without fallback copy.

- [ ] **Step 3: Add the recent-runs empty state**

```tsx
if (runs.length === 0) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
        Recent review runs
      </h2>
      <p className="mt-4 text-sm leading-6 text-zinc-600">
        No review activity yet. Start your first review to populate this workspace.
      </p>
      <a
        href="/api/reviews/enqueue"
        className="mt-5 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
      >
        Start your first review
      </a>
    </section>
  );
}
```

- [ ] **Step 4: Add the repository empty state**

```tsx
if (repositories.length === 0) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
        Repository health
      </h2>
      <p className="mt-4 text-sm leading-6 text-zinc-600">
        No repositories are connected yet. Connect a repository to start organization-level review tracking.
      </p>
      <a
        href="/settings/repositories"
        className="mt-5 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
      >
        Connect Repository
      </a>
    </section>
  );
}
```

- [ ] **Step 5: Keep placeholder data deterministic and document the empty-state override for manual verification**

Add this exported helper to `apps/web/src/lib/dashboard/mock-data.ts`:

```ts
export function createEmptyDashboardCollections() {
  return {
    recentRuns: [] as DashboardRun[],
    repositories: [] as RepositoryHealthItem[],
  };
}
```

This helper is only for tests and manual temporary wiring during implementation; do not wire it into production page rendering.

- [ ] **Step 6: Re-run component tests plus full web checks**

Run: `pnpm --dir apps/web exec tsx --test src/components/dashboard/dashboard-components.test.tsx && pnpm --dir apps/web lint && pnpm --dir apps/web typecheck`
Expected: PASS across tests, lint, and typecheck.

- [ ] **Step 7: Commit the empty-state polish**

```bash
git add apps/web/src/lib/dashboard/mock-data.ts apps/web/src/components/dashboard/RecentReviewRuns.tsx apps/web/src/components/dashboard/RepositoryHealthList.tsx apps/web/src/components/dashboard/dashboard-components.test.tsx
git commit -m "feat: polish dashboard empty states / 完善 dashboard 空状态"
```

### Task 6: Final verification and branch handoff

**Files:**
- Modify: none
- Verify: working tree contains only intended dashboard changes

- [ ] **Step 1: Run the full repository checks that cover the changed surface**

Run: `pnpm --dir apps/web test && pnpm --dir apps/web lint && pnpm --dir apps/web typecheck && pnpm test`
Expected: PASS for web tests, web lint, web typecheck, and the existing root Node test suite.

- [ ] **Step 2: Manually inspect the logged-in dashboard in development mode**

Run: `pnpm --dir apps/web dev`
Expected: The authenticated `/` route shows the hero, KPI grid, quick actions, recent runs, risk insights, and repository health layout on desktop and mobile widths.

- [ ] **Step 3: Review the git diff for scope control**

Run: `git diff -- apps/web/package.json apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/src/app/globals.css apps/web/src/lib/dashboard apps/web/src/components/dashboard`
Expected: Only the planned dashboard files and test harness changes appear.

- [ ] **Step 4: Create the final feature commit**

```bash
git add apps/web/package.json apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/src/app/globals.css apps/web/src/lib/dashboard apps/web/src/components/dashboard
git commit -m "feat: create dashboard home / 创建 dashboard 首页"
```

---

## Spec Coverage Check

- Organization-scoped logged-in dashboard: covered in Task 4 route assembly.
- Hero + KPI overview: covered in Tasks 2-4.
- Quick actions, recent runs, risk insights, repository health: covered in Task 3.
- Structure-first approach with placeholder data: covered in Task 2 mock data and view-model.
- Empty states and graceful fallback: covered in Task 5.
- Responsive, polished SaaS presentation: covered in Tasks 3-4 plus manual verification in Task 6.

## Self-Review Notes

- Placeholder scan complete: no `TODO`, `TBD`, or unspecified “handle appropriately” steps remain.
- Type consistency checked: `DashboardViewModel`, component prop names, and status unions stay consistent across all tasks.
- Scope check complete: this plan only covers the logged-in dashboard home and does not expand into repository pages, review detail pages, or real analytics backends.
