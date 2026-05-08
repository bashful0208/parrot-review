import type { AuthenticatedUser, ReviewRunListRow } from "@reviewer/core";

import {
  DASHBOARD_KPIS,
  DASHBOARD_RECENT_RUNS,
  DASHBOARD_REPOSITORIES,
} from "./mock-data";
import type {
  DashboardNavItem,
  DashboardRun,
  DashboardRunStatus,
  DashboardViewModel,
} from "./types";
import { getViewerName } from "@/lib/utils/viewer-name";

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
  const valid: DashboardRunStatus[] = [
    "running",
    "succeeded",
    "failed",
    "queued",
  ];
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
  if (min < 60)
    return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)
    return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function buildDashboardViewModel(
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string },
  recentRunRows?: ReviewRunListRow[]
): DashboardViewModel {
  const runs: DashboardRun[] = recentRunRows
    ? recentRunRows.map(mapRunRowToDashboardRun)
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
      organizationName: "Acme Engineering",
      viewerName: getViewerName(user),
      title: "Your review workspace is in motion.",
      summary:
        "Track repository health, continue active reviews, and surface the findings that need attention first.",
    },
    kpis: cloneItems(DASHBOARD_KPIS),
    recentRuns: runs,
    repositories: cloneItems(DASHBOARD_REPOSITORIES),
  };
}
