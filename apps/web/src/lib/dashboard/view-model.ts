import type { AuthenticatedUser, ReviewRunListRow } from "@reviewer/core";
import type {
  DailyUsagePoint,
  RepositoryHealthRow,
  UsageSummary,
} from "@reviewer/core";

import { DASHBOARD_RECENT_RUNS } from "./mock-data";
import type { DashboardNavItem, DashboardRun, DashboardRunStatus, DashboardViewModel } from "./types";
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

function shortDay(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
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
      { label: "Reviews This Week", value: String(input.reviewRunCount) },
      { label: "Open Findings", value: String(input.openFindingsCount) },
      { label: "Success Rate", value: `${input.successRate.toFixed(1)}%` },
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
