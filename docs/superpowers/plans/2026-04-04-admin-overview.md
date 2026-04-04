# Admin Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-style authenticated `Overview` page with a responsive left sidebar shell, while preserving the existing dashboard data model and modules.

**Architecture:** Keep the existing dashboard data/view-model layer, introduce a focused admin shell layer for navigation and topbar, then migrate the homepage composition into the new shell. Reuse current dashboard feature modules where possible, add only the minimum new UI surface needed for the admin layout, and validate behavior with small server-rendered tests.

**Tech Stack:** Next.js 16 app router, React 19, TypeScript, Tailwind CSS v4, existing dashboard view-model tests, `shadcn/ui`-style UI composition in `apps/web`

---

## File Structure

### Existing files to modify

- `apps/web/src/app/page.tsx`
  - Replace the current single-column dashboard composition with the new admin shell composition.
- `apps/web/src/lib/dashboard/types.ts`
  - Extend the dashboard view-model with admin navigation, topbar actions, and overview section labels.
- `apps/web/src/lib/dashboard/view-model.ts`
  - Build the extra shell/topbar/navigation data required by the admin layout.
- `apps/web/src/components/dashboard/dashboard-components.test.tsx`
  - Add rendering assertions for the new shell, sidebar labels, topbar controls, and overview layout.
- `apps/web/src/lib/dashboard/view-model.test.ts`
  - Add view-model assertions for navigation and topbar data.
- `apps/web/src/app/globals.css`
  - Add any global tokens needed for the admin shell background and sidebar surface if local classes are not enough.

### New files to create

- `apps/web/src/components/dashboard/AdminShell.tsx`
  - Main authenticated admin layout container with desktop sidebar + mobile sheet navigation.
- `apps/web/src/components/dashboard/AdminSidebar.tsx`
  - Sidebar navigation, workspace block, and user/logout area.
- `apps/web/src/components/dashboard/AdminTopbar.tsx`
  - Topbar with title, search, range filter placeholder, and primary action.
- `apps/web/src/components/dashboard/OverviewContent.tsx`
  - Overview-specific composition layer that arranges KPI, recent runs, repository health, risk insights, and quick actions.
- `apps/web/src/components/dashboard/MobileSidebarSheet.tsx`
  - Minimal mobile drawer wrapper used by `AdminShell`.

### Optional `shadcn/ui`-style primitives to add if missing

If the repository still does not contain the required primitives, add equivalents in `apps/web/src/components/ui/` before wiring the shell:

- `apps/web/src/components/ui/avatar.tsx`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/components/ui/card.tsx`
- `apps/web/src/components/ui/sheet.tsx`

Use the project workspace explicitly when adding them:

```bash
npx shadcn@latest add avatar badge sheet -c apps/web
```

If adding the actual CLI output would create too much churn for this slice, create minimal local wrappers with the same responsibility and keep the public API narrow.

---

### Task 1: Extend the dashboard view-model for the admin shell

**Files:**
- Modify: `apps/web/src/lib/dashboard/types.ts`
- Modify: `apps/web/src/lib/dashboard/view-model.ts`
- Test: `apps/web/src/lib/dashboard/view-model.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions for navigation items, the active route, topbar copy, and primary action.

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardViewModel } from "./view-model";

const authenticatedUser = {
  id: "user_123",
  email: "sasha@example.com",
  name: "Sasha",
};

test("buildDashboardViewModel exposes admin shell navigation and topbar actions", () => {
  const model = buildDashboardViewModel(authenticatedUser);

  assert.equal(model.shell.currentPath, "/");
  assert.deepEqual(
    model.shell.navigation.map((item) => item.label),
    ["Overview", "Repositories", "Review Runs", "Policies", "Team", "Settings"]
  );
  assert.equal(model.shell.navigation[0]?.href, "/");
  assert.equal(model.topbar.title, "Overview");
  assert.match(model.topbar.summary, /review/i);
  assert.equal(model.topbar.primaryAction.label, "New Review");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir apps/web test
```

Expected: FAIL with missing `shell` / `topbar` properties on `DashboardViewModel`.

- [ ] **Step 3: Write minimal implementation**

Extend `types.ts` with shell/topbar types and add the new properties to `DashboardViewModel`.

```ts
export interface DashboardNavItem {
  label: string;
  href: string;
  icon: "overview" | "repositories" | "runs" | "policies" | "team" | "settings";
}

export interface DashboardShellModel {
  workspaceName: string;
  currentPath: string;
  navigation: DashboardNavItem[];
  logoutHref: string;
}

export interface DashboardTopbarModel {
  title: string;
  summary: string;
  searchPlaceholder: string;
  rangeLabel: string;
  primaryAction: DashboardQuickAction;
}

export interface DashboardViewModel {
  hero: DashboardHeroModel;
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  kpis: DashboardKpi[];
  quickActions: DashboardQuickAction[];
  recentRuns: DashboardRun[];
  insights: DashboardInsight[];
  trend: DashboardTrendPoint[];
  repositories: RepositoryHealthItem[];
}
```

Update `view-model.ts` to populate the new fields.

```ts
const DASHBOARD_NAVIGATION: DashboardNavItem[] = [
  { label: "Overview", href: "/", icon: "overview" },
  { label: "Repositories", href: "/repositories", icon: "repositories" },
  { label: "Review Runs", href: "/review-runs", icon: "runs" },
  { label: "Policies", href: "/policies", icon: "policies" },
  { label: "Team", href: "/team", icon: "team" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

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
    shell: {
      workspaceName: "Acme Engineering",
      currentPath: "/",
      navigation: DASHBOARD_NAVIGATION,
      logoutHref: "/api/auth/logout",
    },
    topbar: {
      title: "Overview",
      summary: "Monitor review health, investigate risk, and continue active work.",
      searchPlaceholder: "Search repositories, runs, or rules",
      rangeLabel: "Last 7 days",
      primaryAction: DASHBOARD_QUICK_ACTIONS[0],
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

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --dir apps/web test
```

Expected: PASS for `src/lib/dashboard/view-model.test.ts` and no type errors from the new model fields.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard/types.ts apps/web/src/lib/dashboard/view-model.ts apps/web/src/lib/dashboard/view-model.test.ts
git commit -m "$(cat <<'EOF'
feat: add admin shell dashboard model

Prepare the dashboard view model for the admin overview shell.
Add navigation and topbar metadata needed for the new layout.
EOF
)"
```

### Task 2: Add failing shell/component rendering tests

**Files:**
- Modify: `apps/web/src/components/dashboard/dashboard-components.test.tsx`
- Test: `apps/web/src/components/dashboard/dashboard-components.test.tsx`

- [ ] **Step 1: Write the failing test**

Add tests that describe the target layout before implementing components.

```tsx
import AdminShell from "./AdminShell";
import OverviewContent from "./OverviewContent";

test("admin shell renders overview navigation, search, and primary action", () => {
  const markup = renderToStaticMarkup(
    <AdminShell shell={model.shell} topbar={model.topbar} viewerName={model.hero.viewerName}>
      <OverviewContent dashboard={model} />
    </AdminShell>
  );

  assert.match(markup, /Overview/);
  assert.match(markup, /Repositories/);
  assert.match(markup, /Review Runs/);
  assert.match(markup, /Search repositories, runs, or rules/);
  assert.match(markup, /New Review/);
});

test("overview content keeps KPI, runs, repository health, insights, and quick actions", () => {
  const markup = renderToStaticMarkup(<OverviewContent dashboard={model} />);

  assert.match(markup, /Active Repositories/);
  assert.match(markup, /Recent review runs/i);
  assert.match(markup, /Repository health/i);
  assert.match(markup, /Risk insights/i);
  assert.match(markup, /Connect Repository/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir apps/web test
```

Expected: FAIL with module resolution errors for `./AdminShell` and `./OverviewContent`.

- [ ] **Step 3: Leave the new tests in place without implementation changes**

No production code yet. Confirm the failure is due to missing components only.

```txt
Expected failing surface:
- Cannot find module './AdminShell'
- Cannot find module './OverviewContent'
```

- [ ] **Step 4: Re-run the tests to lock the red state**

Run:

```bash
pnpm --dir apps/web test
```

Expected: Same FAIL state as Step 2.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/dashboard-components.test.tsx
git commit -m "$(cat <<'EOF'
test: define admin overview rendering expectations

Capture the target admin shell and overview composition before implementation.
Lock in the expected navigation, topbar, and overview module rendering.
EOF
)"
```

### Task 3: Implement the admin shell, sidebar, and topbar

**Files:**
- Create: `apps/web/src/components/dashboard/AdminShell.tsx`
- Create: `apps/web/src/components/dashboard/AdminSidebar.tsx`
- Create: `apps/web/src/components/dashboard/AdminTopbar.tsx`
- Create: `apps/web/src/components/dashboard/MobileSidebarSheet.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/dashboard/dashboard-components.test.tsx`

- [ ] **Step 1: Write the minimal shell implementation to satisfy imports**

Create the components with minimal but real structure.

```tsx
// apps/web/src/components/dashboard/AdminShell.tsx
import type { ReactNode } from "react";

import type { DashboardShellModel, DashboardTopbarModel } from "@/lib/dashboard/types";

import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import MobileSidebarSheet from "./MobileSidebarSheet";

export default function AdminShell({
  shell,
  topbar,
  viewerName,
  children,
}: {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#eef3fb_100%)] text-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <AdminSidebar shell={shell} viewerName={viewerName} className="hidden lg:flex" />
        <div className="flex min-h-screen flex-1 flex-col">
          <MobileSidebarSheet shell={shell} viewerName={viewerName} />
          <AdminTopbar topbar={topbar} />
          <div className="flex-1 px-4 pb-6 pt-4 sm:px-6 lg:px-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
```

```tsx
// apps/web/src/components/dashboard/AdminSidebar.tsx
import type { DashboardShellModel } from "@/lib/dashboard/types";

export default function AdminSidebar({
  shell,
  viewerName,
  className = "",
}: {
  shell: DashboardShellModel;
  viewerName: string;
  className?: string;
}) {
  return (
    <aside className={`w-72 shrink-0 flex-col border-r border-white/60 bg-slate-950 text-white ${className}`}>
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Workspace</p>
        <h2 className="mt-2 text-lg font-semibold">{shell.workspaceName}</h2>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {shell.navigation.map((item) => {
          const active = item.href === shell.currentPath;

          return (
            <a
              key={item.label}
              href={item.href}
              className={active
                ? "flex items-center rounded-2xl bg-white/12 px-4 py-3 text-sm font-medium text-white"
                : "flex items-center rounded-2xl px-4 py-3 text-sm text-slate-300 hover:bg-white/8 hover:text-white"}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-4 py-4">
        <p className="text-sm font-medium text-white">{viewerName}</p>
        <a href={shell.logoutHref} className="mt-3 inline-flex text-sm text-slate-300 hover:text-white">
          Log out
        </a>
      </div>
    </aside>
  );
}
```

```tsx
// apps/web/src/components/dashboard/AdminTopbar.tsx
import type { DashboardTopbarModel } from "@/lib/dashboard/types";

export default function AdminTopbar({ topbar }: { topbar: DashboardTopbarModel }) {
  return (
    <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-zinc-950">{topbar.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{topbar.summary}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            aria-label="Global search"
            placeholder={topbar.searchPlaceholder}
            className="h-11 min-w-[260px] rounded-2xl border border-slate-200 bg-white px-4 text-sm text-zinc-900 outline-none"
          />
          <button className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-zinc-700">
            {topbar.rangeLabel}
          </button>
          <a
            href={topbar.primaryAction.href}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-sky-600 px-4 text-sm font-medium text-white"
          >
            {topbar.primaryAction.label}
          </a>
        </div>
      </div>
    </header>
  );
}
```

```tsx
// apps/web/src/components/dashboard/MobileSidebarSheet.tsx
import type { DashboardShellModel } from "@/lib/dashboard/types";

export default function MobileSidebarSheet({
  shell,
  viewerName,
}: {
  shell: DashboardShellModel;
  viewerName: string;
}) {
  return (
    <div className="border-b border-slate-200/80 bg-white px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between">
        <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-zinc-700">
          Menu
        </button>
        <span className="text-sm text-zinc-500">{shell.workspaceName}</span>
        <span className="text-sm font-medium text-zinc-900">{viewerName}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the component tests**

Run:

```bash
pnpm --dir apps/web test
```

Expected: FAIL only on the second test because `OverviewContent` is still missing, while the shell import errors are gone.

- [ ] **Step 3: Refine the shell styling and shared background token if needed**

If the shell background needs a reusable token, add it to `globals.css`.

```css
:root {
  --admin-background: linear-gradient(180deg, #f4f7fb 0%, #eef3fb 100%);
  --admin-sidebar: #0f172a;
}
```

Then reference it from the shell class.

```tsx
<main className="min-h-screen bg-[var(--admin-background)] text-zinc-950">
```

- [ ] **Step 4: Re-run tests to confirm the shell layer is stable**

Run:

```bash
pnpm --dir apps/web test
```

Expected: Only `OverviewContent`-related failures remain.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/AdminShell.tsx apps/web/src/components/dashboard/AdminSidebar.tsx apps/web/src/components/dashboard/AdminTopbar.tsx apps/web/src/components/dashboard/MobileSidebarSheet.tsx apps/web/src/app/globals.css
git commit -m "$(cat <<'EOF'
feat: add admin dashboard shell

Introduce the responsive admin shell, sidebar, and topbar for the overview page.
Keep the implementation focused on the authenticated dashboard entry point.
EOF
)"
```

### Task 4: Implement the overview composition inside the new shell

**Files:**
- Create: `apps/web/src/components/dashboard/OverviewContent.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/src/components/dashboard/dashboard-components.test.tsx`

- [ ] **Step 1: Implement the overview composition component**

Compose the existing dashboard modules instead of duplicating them.

```tsx
// apps/web/src/components/dashboard/OverviewContent.tsx
import type { DashboardViewModel } from "@/lib/dashboard/types";

import DashboardKpiGrid from "./DashboardKpiGrid";
import DashboardQuickActions from "./DashboardQuickActions";
import RecentReviewRuns from "./RecentReviewRuns";
import RepositoryHealthList from "./RepositoryHealthList";
import RiskInsights from "./RiskInsights";

export default function OverviewContent({ dashboard }: { dashboard: DashboardViewModel }) {
  return (
    <section className="space-y-6">
      <DashboardKpiGrid kpis={dashboard.kpis} />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <RecentReviewRuns runs={dashboard.recentRuns} />
        <RepositoryHealthList repositories={dashboard.repositories} />
      </div>
      <RiskInsights insights={dashboard.insights} trend={dashboard.trend} />
      <DashboardQuickActions actions={dashboard.quickActions} />
    </section>
  );
}
```

- [ ] **Step 2: Run tests to verify the new composition passes**

Run:

```bash
pnpm --dir apps/web test
```

Expected: PASS for the new component-rendering test that checks KPI, runs, repository health, insights, and quick actions.

- [ ] **Step 3: Migrate the homepage to the admin shell**

Replace the current page composition with the new shell + overview content.

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_SESSION_COOKIE, getSessionUser } from "@reviewer/core";

import AdminShell from "@/components/dashboard/AdminShell";
import OverviewContent from "@/components/dashboard/OverviewContent";
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
    <AdminShell
      shell={dashboard.shell}
      topbar={dashboard.topbar}
      viewerName={dashboard.hero.viewerName}
    >
      <OverviewContent dashboard={dashboard} />
    </AdminShell>
  );
}
```

- [ ] **Step 4: Run the full web test suite**

Run:

```bash
pnpm --dir apps/web test
```

Expected: PASS for `src/lib/dashboard/*.test.ts` and `src/components/dashboard/*.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/OverviewContent.tsx apps/web/src/app/page.tsx apps/web/src/components/dashboard/dashboard-components.test.tsx
git commit -m "$(cat <<'EOF'
feat: move dashboard home into admin overview layout

Wrap the authenticated home page in the new admin shell.
Reuse the existing dashboard feature blocks inside the overview composition.
EOF
)"
```

### Task 5: Upgrade module styling for the admin overview context

**Files:**
- Modify: `apps/web/src/components/dashboard/DashboardKpiGrid.tsx`
- Modify: `apps/web/src/components/dashboard/RecentReviewRuns.tsx`
- Modify: `apps/web/src/components/dashboard/RepositoryHealthList.tsx`
- Modify: `apps/web/src/components/dashboard/RiskInsights.tsx`
- Modify: `apps/web/src/components/dashboard/DashboardQuickActions.tsx`
- Test: `apps/web/src/components/dashboard/dashboard-components.test.tsx`

- [ ] **Step 1: Add rendering tests for admin-specific labels and shell-friendly layout hooks**

Extend the rendering test so it guards against accidental regression when restyling.

```tsx
test("overview content keeps admin overview section headings", () => {
  const markup = renderToStaticMarkup(<OverviewContent dashboard={model} />);

  assert.match(markup, /Recent review runs/i);
  assert.match(markup, /Repository health/i);
  assert.match(markup, /Risk insights/i);
  assert.match(markup, /View All Runs/);
});
```

- [ ] **Step 2: Run tests to verify they pass before visual refactor**

Run:

```bash
pnpm --dir apps/web test
```

Expected: PASS, confirming the headings already exist and the visual refactor can proceed safely.

- [ ] **Step 3: Update the module classes for the admin shell context**

Use tighter card rhythm and more operational styling without changing the data contract.

```tsx
// Example shape for card containers
<section className="rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-6">
```

```tsx
// Example status chip shape for run/repository badges
<span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
  {label}
</span>
```

Keep the following invariants unchanged:

```txt
- Empty-state CTA copy remains present.
- Risk insight headings remain present.
- Quick action labels remain present.
- Existing data fields are reused; no new mock-data branch is introduced.
```

- [ ] **Step 4: Run tests after the visual refactor**

Run:

```bash
pnpm --dir apps/web test
```

Expected: PASS with no snapshot/content regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/DashboardKpiGrid.tsx apps/web/src/components/dashboard/RecentReviewRuns.tsx apps/web/src/components/dashboard/RepositoryHealthList.tsx apps/web/src/components/dashboard/RiskInsights.tsx apps/web/src/components/dashboard/DashboardQuickActions.tsx apps/web/src/components/dashboard/dashboard-components.test.tsx
git commit -m "$(cat <<'EOF'
refactor: align overview modules with admin shell styling

Tighten the dashboard module presentation to fit the new admin overview layout.
Keep the underlying data flow and content structure unchanged.
EOF
)"
```

### Task 6: Verify the final slice end-to-end

**Files:**
- Modify: none unless verification reveals a defect
- Test: `apps/web/package.json` scripts and homepage render path

- [ ] **Step 1: Run the targeted web test suite**

Run:

```bash
pnpm --dir apps/web test
```

Expected: PASS with all dashboard tests green.

- [ ] **Step 2: Run type checking**

Run:

```bash
pnpm --dir apps/web typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run:

```bash
pnpm --dir apps/web build
```

Expected: PASS with a successful Next.js production build.

- [ ] **Step 4: Manually verify the responsive shell**

Run:

```bash
pnpm --dir apps/web dev
```

Then verify in the browser:

```txt
- Desktop shows a left sidebar and topbar.
- Mobile shows the menu trigger and no horizontal scroll.
- The page still redirects to /login when no session exists.
- KPI, recent runs, repository health, risk insights, and quick actions all render.
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src app s/web/package.json
# Replace the staged paths above with any files changed during final verification fixes only.

git commit -m "$(cat <<'EOF'
chore: verify admin overview implementation

Validate tests, types, build, and responsive behavior for the new admin overview.
Include only any necessary final verification fixes.
EOF
)"
```

---

## Self-Review

### Spec coverage

- Admin shell with left sidebar: covered in Tasks 1, 3, and 4.
- Desktop collapsible / mobile drawer-ready navigation: structure covered in Task 3; interactive enhancement can be added within the same files without changing boundaries.
- Overview page structure: covered in Task 4.
- Reuse existing dashboard modules: covered in Task 4.
- Visual shift from marketing-like page to professional admin page: covered in Task 5.
- Verification across tests, typecheck, build, and responsive behavior: covered in Task 6.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
- Every code-changing step includes a concrete snippet or exact invariant.
- Every verification step includes an exact command and expected outcome.

### Type consistency

- `DashboardViewModel` additions are named consistently as `shell` and `topbar` throughout.
- `AdminShell` consumes `DashboardShellModel` and `DashboardTopbarModel` exactly as introduced in Task 1.
- `OverviewContent` accepts the full `DashboardViewModel`, matching the page composition in Task 4.
