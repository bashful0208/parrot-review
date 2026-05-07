import type { AuthenticatedUser, ReviewRunListRow } from "@reviewer/core";

import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import type {
  DashboardShellModel,
  DashboardTopbarModel,
} from "@/lib/dashboard/types";
import { formatRelativeTime } from "@/lib/usage/format";
import { getViewerName } from "@/lib/utils/viewer-name";

export interface ReviewRunListItem {
  id: string;
  repositoryFullName: string;
  prLabel: string;
  prTitle: string;
  status: string;
  triggerType: string;
  startedAtLabel: string;
  findingsCount: number;
  securityFindingsCount: number;
  detailHref: string;
}

export interface StatusFilterOption {
  value: string;
  label: string;
  href: string;
  active: boolean;
}

export interface ReviewRunsListViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  runs: ReviewRunListItem[];
  pagination: {
    page: number;
    perPage: number;
    totalCount: number;
    rangeLabel: string;
    prevHref: string | null;
    nextHref: string | null;
  };
  statusFilter: {
    current: string | null;
    options: StatusFilterOption[];
  };
  hasData: boolean;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
];

function buildStatusFilter(
  current: string | null,
  page: number
): { current: string | null; options: StatusFilterOption[] } {
  return {
    current,
    options: STATUS_OPTIONS.map((opt) => {
      const params = new URLSearchParams({ page: "1" });
      if (opt.value !== "all") params.set("status", opt.value);
      return {
        value: opt.value,
        label: opt.label,
        href: `/review-runs?${params.toString()}`,
        active:
          opt.value === "all" ? current === null : opt.value === current,
      };
    }),
  };
}

function buildReviewRunsHref(args: {
  status: string | null;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (args.status) params.set("status", args.status);
  if (args.page > 1) params.set("page", String(args.page));
  const qs = params.toString();
  return qs ? `/review-runs?${qs}` : "/review-runs";
}

function buildPagination(args: {
  status: string | null;
  page: number;
  perPage: number;
  totalCount: number;
}): ReviewRunsListViewModel["pagination"] {
  const totalPages = Math.max(1, Math.ceil(args.totalCount / args.perPage));
  const safePage = Math.min(Math.max(args.page, 1), totalPages);
  const start =
    args.totalCount === 0 ? 0 : (safePage - 1) * args.perPage + 1;
  const end = Math.min(safePage * args.perPage, args.totalCount);
  return {
    page: safePage,
    perPage: args.perPage,
    totalCount: args.totalCount,
    rangeLabel:
      args.totalCount === 0
        ? "No runs"
        : `Showing ${start}–${end} of ${args.totalCount}`,
    prevHref:
      safePage > 1
        ? buildReviewRunsHref({ status: args.status, page: safePage - 1 })
        : null,
    nextHref:
      safePage < totalPages
        ? buildReviewRunsHref({ status: args.status, page: safePage + 1 })
        : null,
  };
}

function buildRow(row: ReviewRunListRow, now: Date): ReviewRunListItem {
  return {
    id: row.id,
    repositoryFullName: row.repositoryFullName,
    prLabel: `#${row.prNumber}`,
    prTitle: row.prTitle,
    status: row.status,
    triggerType: row.triggerType,
    startedAtLabel: row.startedAt
      ? formatRelativeTime(row.startedAt, now)
      : formatRelativeTime(row.createdAt, now),
    findingsCount: row.findingsCount,
    securityFindingsCount: row.securityFindingsCount,
    detailHref: `/review-runs/${row.id}`,
  };
}

export function buildReviewRunsListViewModel(args: {
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string };
  rows: ReviewRunListRow[];
  totalCount: number;
  statusFilter: string | null;
  page: number;
  perPage: number;
  now?: Date;
}): ReviewRunsListViewModel {
  const now = args.now ?? new Date();
  return {
    shell: {
      workspaceName: "Acme Engineering",
      currentPath: "/review-runs",
      logoutHref: "/api/auth/logout",
      navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
    },
    topbar: {
      title: "Review Runs",
      summary: "Automated code review execution history",
      searchPlaceholder: "",
      rangeLabel: "",
    },
    viewerName: getViewerName(args.user),
    runs: args.rows.map((row) => buildRow(row, now)),
    pagination: buildPagination({
      status: args.statusFilter,
      page: args.page,
      perPage: args.perPage,
      totalCount: args.totalCount,
    }),
    statusFilter: buildStatusFilter(args.statusFilter, args.page),
    hasData: args.totalCount > 0,
  };
}
