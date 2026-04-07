# Repository Detail Page Design

**Date:** 2026-04-06  
**Status:** Approved

---

## Context

Users currently see a flat list of connected repositories at `/repositories`. There is no way to view the details of a specific repository (full name, default branch, webhook URL/secret, etc.) without going back to the connect wizard. This spec defines a read-only detail page reachable by clicking any row in the repository list.

---

## URL & Routing

- **Route:** `/repositories/[id]` (Next.js App Router dynamic segment)
- **Auth:** Same session-cookie guard as the list page — redirect to `/login` if unauthenticated
- **Back navigation:** "← 返回仓库列表" link to `/repositories`

---

## Layout

浅色系，与现有页面风格一致（白色卡片、slate/zinc 色板、深色侧边栏不变）。

```
AdminShell (existing)
└── page content
    ├── Back link
    ├── Page header  (repo icon · repo name + active badge · provider · connected date)
    └── Two-column grid
        ├── Left card  — 基本信息
        └── Right card — Webhook 配置
```

### Left card — 基本信息

| Field | Source |
|---|---|
| 完整名称 | `full_name` |
| 提供商 | `provider` (GitHub chip with icon) |
| 默认分支 | `default_branch` |
| 接入时间 | `created_at` formatted as `YYYY-MM-DD` |

### Right card — Webhook 配置

| Field | Interaction |
|---|---|
| Webhook URL | 只读 input + 复制按钮 |
| Webhook Secret | 只读 input（默认打码 `••••`）+ 显示/隐藏切换 + 复制按钮 |
| 底部提示 | 绿色 hint 框："Webhook 已激活 / 在 GitHub → Settings → Webhooks 配置以上信息" |

---

## Data

### New DB query

`getRepositoryById(id: string, organizationId: string)` — added to `packages/core/src/repositories/repository.ts`.

Returns: `id, name, full_name, provider, default_branch, status, created_at` + webhook URL and secret from `repo_integrations.metadata`.

### ViewModel

New file: `apps/web/src/lib/repositories/detail-view-model.ts`

```ts
interface RepositoryDetailItem {
  id: string
  fullName: string
  provider: string
  defaultBranch: string
  status: string
  createdAtLabel: string   // YYYY-MM-DD
  webhookUrl: string
  webhookSecret: string
}
```

### New API route (optional)

`GET /api/repositories/[id]` — for future use; the detail page can fetch server-side directly for now.

---

## Components

| Component | File | Notes |
|---|---|---|
| Page | `apps/web/src/app/repositories/[id]/page.tsx` | Server component, fetches data, renders shell |
| `RepositoryDetail` | `apps/web/src/components/repositories/RepositoryDetail.tsx` | Client component — handles copy & show/hide state |

### RepositoryList link

Each row in `RepositoryList.tsx` becomes a `<Link href={/repositories/${repo.id}}>` wrapping the existing `<article>`.

---

## shadcn/ui Components Used

- `Card`, `CardHeader`, `CardContent` — two info cards
- `Badge` — active status + provider chip
- `Button` variant `ghost` size `sm` — copy / show-hide buttons
- `Separator` — divider between webhook fields

---

## Behavior Details

- **Copy button:** `navigator.clipboard.writeText(value)` — button label momentarily changes to "已复制 ✓" then reverts after 2 s
- **Show/Hide secret:** local `useState(false)` — toggles between `••••` and plain text; button icon/label swaps accordingly
- **Secret source:** stored in `repo_integrations.metadata.webhook_secret`; passed from server to client (not exposed in public API)

---

## Verification

1. Navigate to `/repositories` → click a repo row → arrives at `/repositories/[id]`
2. Both cards render with correct data
3. Copy button copies to clipboard; label flashes "已复制 ✓"
4. Secret is masked by default; "显示" toggles visibility
5. Unauthenticated request redirects to `/login`
6. Invalid/non-owned repo ID returns 404 or redirects back to list
