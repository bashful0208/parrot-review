# Repository Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/repositories/[id]` detail page showing basic repo info and Webhook URL/Secret, reachable by clicking a row in the repository list.

**Architecture:** Server page fetches repo + integration data from Postgres, builds a typed view model, and passes it to a client component that handles copy-to-clipboard and show/hide secret interactions. All routing, auth, and shell layout reuse existing patterns from the list page.

**Tech Stack:** Next.js App Router (server components), TypeScript, Tailwind CSS, shadcn/ui (Badge, Button), Node.js built-in test runner via `tsx --test`

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Modify | `packages/core/src/repositories/repository.ts` | Add `getRepositoryById` query |
| Create | `apps/web/src/lib/repositories/detail-view-model.ts` | `RepositoryDetailItem` type + builder |
| Create | `apps/web/src/lib/repositories/detail-view-model.test.ts` | Tests for builder |
| Create | `apps/web/src/components/repositories/RepositoryDetail.tsx` | Client component (copy, show/hide) |
| Create | `apps/web/src/app/repositories/[id]/page.tsx` | Server page |
| Modify | `apps/web/src/components/repositories/RepositoryList.tsx` | Wrap rows in `<Link>` |
| Modify | `apps/web/package.json` | Extend test glob to pick up new test file |

---

## Task 1: DB query — `getRepositoryById`

**Files:**
- Modify: `packages/core/src/repositories/repository.ts`

- [ ] **Step 1: Add `RepositoryDetailRow` type and `getRepositoryById` function**

Append to `packages/core/src/repositories/repository.ts`:

```typescript
export interface RepositoryDetailRow {
  id: string;
  name: string;
  full_name: string;
  provider: string;
  default_branch: string;
  status: string;
  created_at: Date;
  webhook_secret: string;
}

export async function getRepositoryById(
  id: string,
  organizationId: string
): Promise<RepositoryDetailRow | null> {
  const result = await getPool().query<RepositoryDetailRow & { metadata: unknown }>(
    `select r.id, r.name, r.full_name, r.provider, r.default_branch,
            r.status, r.created_at,
            ri.metadata
       from public.repositories r
       join public.repo_integrations ri
         on ri.repository_id = r.id and ri.provider = r.provider
      where r.id = $1 and r.organization_id = $2
      limit 1`,
    [id, organizationId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  const meta = row.metadata as { webhook_secret?: string } | null;

  return {
    id: row.id,
    name: row.name,
    full_name: row.full_name,
    provider: row.provider,
    default_branch: row.default_branch,
    status: row.status,
    created_at: row.created_at,
    webhook_secret: meta?.webhook_secret ?? "",
  };
}
```

- [ ] **Step 2: Export the new function via core index**

`packages/core/src/index.ts` already re-exports `./repositories/repository.ts` — no change needed. Verify:

```bash
grep "repositories/repository" packages/core/src/index.ts
```

Expected: one matching line.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/repositories/repository.ts
git commit -m "feat: add getRepositoryById query with webhook secret / 新增仓库详情查询（含 webhook secret）"
```

---

## Task 2: Detail view-model — types, builder, tests

**Files:**
- Create: `apps/web/src/lib/repositories/detail-view-model.ts`
- Create: `apps/web/src/lib/repositories/detail-view-model.test.ts`
- Modify: `apps/web/package.json` (test script)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/repositories/detail-view-model.test.ts`:

```typescript
import test from "node:test";
import assert from "node:assert/strict";

import { buildRepositoryDetailViewModel } from "./detail-view-model";
import type { RepositoryDetailRow } from "@reviewer/core";

const baseRow: RepositoryDetailRow = {
  id: "repo-uuid-1",
  name: "my-repo",
  full_name: "myorg/my-repo",
  provider: "github",
  default_branch: "main",
  status: "active",
  created_at: new Date("2026-04-04T10:00:00Z"),
  webhook_secret: "abc123secret",
};

test("buildRepositoryDetailViewModel maps all fields", () => {
  const vm = buildRepositoryDetailViewModel(
    baseRow,
    "https://app.example.com/api/webhooks/github"
  );

  assert.equal(vm.id, "repo-uuid-1");
  assert.equal(vm.fullName, "myorg/my-repo");
  assert.equal(vm.provider, "github");
  assert.equal(vm.defaultBranch, "main");
  assert.equal(vm.status, "active");
  assert.equal(vm.webhookSecret, "abc123secret");
  assert.equal(vm.webhookUrl, "https://app.example.com/api/webhooks/github");
  assert.equal(vm.createdAtLabel, "2026-04-04");
});

test("buildRepositoryDetailViewModel formats date as YYYY-MM-DD", () => {
  const vm = buildRepositoryDetailViewModel(
    { ...baseRow, created_at: new Date("2025-12-01T00:00:00Z") },
    ""
  );
  assert.equal(vm.createdAtLabel, "2025-12-01");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/web && pnpm exec tsx --test src/lib/repositories/detail-view-model.test.ts
```

Expected: error — `buildRepositoryDetailViewModel` not found.

- [ ] **Step 3: Create the view-model module**

Create `apps/web/src/lib/repositories/detail-view-model.ts`:

```typescript
import type { AuthenticatedUser, RepositoryDetailRow } from "@reviewer/core";

import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import type { DashboardShellModel, DashboardTopbarModel } from "@/lib/dashboard/types";

export interface RepositoryDetailItem {
  id: string;
  fullName: string;
  provider: string;
  defaultBranch: string;
  status: string;
  createdAtLabel: string;
  webhookUrl: string;
  webhookSecret: string;
}

export interface RepositoryDetailViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  repository: RepositoryDetailItem;
}

export function buildRepositoryDetailViewModel(
  row: RepositoryDetailRow,
  webhookUrl: string
): RepositoryDetailItem {
  return {
    id: row.id,
    fullName: row.full_name,
    provider: row.provider,
    defaultBranch: row.default_branch,
    status: row.status,
    createdAtLabel: new Date(row.created_at).toISOString().slice(0, 10),
    webhookUrl,
    webhookSecret: row.webhook_secret,
  };
}

function getViewerName(user: Pick<AuthenticatedUser, "email" | "name">): string {
  if (user.name && user.name.trim().length > 0) return user.name;
  return user.email.split("@")[0];
}

export function buildRepositoryDetailPageViewModel(
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string },
  row: RepositoryDetailRow,
  webhookUrl: string
): RepositoryDetailViewModel {
  return {
    shell: {
      workspaceName: "Acme Engineering",
      currentPath: "/repositories",
      logoutHref: "/api/auth/logout",
      navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
    },
    topbar: {
      title: row.full_name,
      summary: "",
      searchPlaceholder: "",
      rangeLabel: "",
    },
    viewerName: getViewerName(user),
    repository: buildRepositoryDetailViewModel(row, webhookUrl),
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/web && pnpm exec tsx --test src/lib/repositories/detail-view-model.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Update test script in `apps/web/package.json`**

Change the `"test"` line from:
```json
"test": "pnpm exec tsx --test src/lib/dashboard/*.test.ts src/components/dashboard/*.test.tsx"
```
to:
```json
"test": "pnpm exec tsx --test src/lib/dashboard/*.test.ts src/lib/repositories/*.test.ts src/components/dashboard/*.test.tsx"
```

- [ ] **Step 6: Confirm all tests still pass**

```bash
cd apps/web && pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/repositories/detail-view-model.ts \
        apps/web/src/lib/repositories/detail-view-model.test.ts \
        apps/web/package.json
git commit -m "feat: add repository detail view-model and tests / 新增仓库详情 view-model 及测试"
```

---

## Task 3: `RepositoryDetail` client component

**Files:**
- Create: `apps/web/src/components/repositories/RepositoryDetail.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/repositories/RepositoryDetail.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, GitBranch, Copy, Eye, EyeOff, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RepositoryDetailItem } from "@/lib/repositories/detail-view-model";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "已复制" : "复制"}
    </Button>
  );
}

export default function RepositoryDetail({
  repository,
}: {
  repository: RepositoryDetailItem;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/repositories"
        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"
      >
        <ChevronLeft className="size-4" />
        返回仓库列表
      </Link>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <GitBranch className="size-5 text-indigo-500" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-zinc-950">
              {repository.fullName}
            </h1>
            <Badge
              variant="outline"
              className={
                repository.status === "active"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 bg-zinc-100 text-zinc-600"
              }
            >
              {repository.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            {repository.provider} · 接入于 {repository.createdAtLabel}
          </p>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: 基本信息 */}
        <section className="rounded-[20px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            基本信息
          </h2>
          <dl className="divide-y divide-slate-100">
            <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium text-zinc-400">完整名称</dt>
              <dd className="text-sm font-medium text-zinc-800">{repository.fullName}</dd>
            </div>
            <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium text-zinc-400">提供商</dt>
              <dd>
                <Badge variant="outline" className="text-xs text-zinc-500">
                  {repository.provider}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium text-zinc-400">默认分支</dt>
              <dd className="text-sm font-medium text-zinc-800">{repository.defaultBranch}</dd>
            </div>
            <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium text-zinc-400">接入时间</dt>
              <dd className="text-sm font-medium text-zinc-800">{repository.createdAtLabel}</dd>
            </div>
          </dl>
        </section>

        {/* Right: Webhook 配置 */}
        <section className="rounded-[20px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Webhook 配置
          </h2>
          <div className="space-y-4">
            {/* Webhook URL */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">Webhook URL</p>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-zinc-500">
                  {repository.webhookUrl}
                </div>
                <CopyButton value={repository.webhookUrl} />
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* Webhook Secret */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">Webhook Secret</p>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-zinc-500">
                  {showSecret ? repository.webhookSecret : "•".repeat(24)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSecret((v) => !v)}
                >
                  {showSecret ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                  {showSecret ? "隐藏" : "显示"}
                </Button>
                <CopyButton value={repository.webhookSecret} />
              </div>
            </div>

            {/* Hint */}
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-medium text-emerald-700">Webhook 已激活</p>
                <p className="mt-0.5 text-xs text-emerald-600/70">
                  在 GitHub → Settings → Webhooks 中配置以上 URL 和 Secret
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/repositories/RepositoryDetail.tsx
git commit -m "feat: add RepositoryDetail client component / 新增仓库详情客户端组件"
```

---

## Task 4: Server page `/repositories/[id]`

**Files:**
- Create: `apps/web/src/app/repositories/[id]/page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/repositories/[id]/page.tsx`:

```tsx
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getRepositoryById,
  getSessionUser,
} from "@reviewer/core";

import AdminShell from "@/components/dashboard/AdminShell";
import RepositoryDetail from "@/components/repositories/RepositoryDetail";
import { buildRepositoryDetailPageViewModel } from "@/lib/repositories/detail-view-model";

export default async function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) redirect("/repositories");

  const row = await getRepositoryById(id, orgId);
  if (!row) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const webhookUrl = appUrl
    ? `${appUrl}/api/webhooks/github`
    : `https://${(await headers()).get("host") ?? "localhost"}/api/webhooks/github`;

  const vm = buildRepositoryDetailPageViewModel(user, row, webhookUrl);

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <RepositoryDetail repository={vm.repository} />
    </AdminShell>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/repositories/[id]/page.tsx
git commit -m "feat: add repository detail page route / 新增仓库详情页路由"
```

---

## Task 5: Make list rows clickable

**Files:**
- Modify: `apps/web/src/components/repositories/RepositoryList.tsx`

- [ ] **Step 1: Wrap each row with Link**

In `apps/web/src/components/repositories/RepositoryList.tsx`, add the `Link` import at the top:

```tsx
import Link from "next/link";
```

Then wrap the `<article>` element in a Link. Replace:

```tsx
<article
  key={repo.id}
  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
>
```

with:

```tsx
<Link
  key={repo.id}
  href={`/repositories/${repo.id}`}
  className="block transition-colors hover:bg-slate-50/80"
>
  <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
```

And close the `</Link>` after `</article>`:

```tsx
  </article>
</Link>
```

Remove `key={repo.id}` from `<article>` (it moves to `<Link>`).

- [ ] **Step 2: Run all tests**

```bash
cd apps/web && pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/repositories/RepositoryList.tsx
git commit -m "feat: make repository list rows clickable / 仓库列表行可点击跳转详情"
```

---

## Verification

1. Start dev server: `pnpm dev` (from repo root)
2. Log in and go to `/repositories`
3. Click any repo row → should navigate to `/repositories/<id>`
4. Verify both cards render with correct data
5. Click "复制" on Webhook URL → browser clipboard contains the URL
6. Secret shows `••••` by default; click "显示" → secret visible; click "隐藏" → masked again
7. Click "复制" on secret → clipboard contains the secret value
8. Open an incognito window, visit `/repositories/<id>` → redirects to `/login`
9. Visit `/repositories/nonexistent-id` → 404 page
