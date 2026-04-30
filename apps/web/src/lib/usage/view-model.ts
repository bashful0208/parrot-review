import type { AuthenticatedUser } from "@reviewer/core";
import type {
  DailyUsagePoint,
  RecentUsageFailure,
  UsageSummary,
} from "@reviewer/core";

import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import type { DashboardShellModel, DashboardTopbarModel } from "@/lib/dashboard/types";
import { getViewerName } from "@/lib/utils/viewer-name";

import {
  formatCompactNumber,
  formatLatencyMs,
  formatPercent,
  formatRelativeTime,
  formatUsd,
  rangeKeyFromDays,
  type UsageRangeKey,
} from "./format";

export interface UsageKpi {
  label: string;
  value: string;
  hint?: string;
}

export interface UsageDailyPoint {
  day: string;       // YYYY-MM-DD
  costUsd: number;   // raw number for chart
  calls: number;
  costLabel: string; // formatted
  shortDay: string;  // e.g. "Apr 30"
}

export interface UsageFailureRow {
  id: string;
  taskTypeLabel: string;
  providerLabel: string;
  modelLabel: string;
  errorCodeLabel: string;
  latencyLabel: string;
  occurredAtLabel: string;
  reviewRunId: string | null;
  pullRequestId: string | null;
}

export interface UsageRangeOption {
  key: UsageRangeKey;
  label: string;
  href: string;
  active: boolean;
}

export interface UsageViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  range: {
    days: number;
    options: UsageRangeOption[];
  };
  kpis: UsageKpi[];
  daily: UsageDailyPoint[];
  failures: UsageFailureRow[];
  hasData: boolean;
}

function buildShell(currentPath: string): DashboardShellModel {
  return {
    workspaceName: "Acme Engineering",
    currentPath,
    logoutHref: "/api/auth/logout",
    navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
  };
}

const RANGES: { key: UsageRangeKey; label: string; days: number }[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
];

function buildKpis(summary: UsageSummary): UsageKpi[] {
  const successRate = formatPercent(summary.successCalls, summary.totalCalls);
  return [
    {
      label: "Total calls",
      value: formatCompactNumber(summary.totalCalls),
      hint: `${formatCompactNumber(summary.successCalls)} ok / ${formatCompactNumber(
        summary.failedCalls
      )} failed`,
    },
    {
      label: "Success rate",
      value: successRate,
      hint:
        summary.truncatedCalls > 0
          ? `${formatCompactNumber(summary.truncatedCalls)} truncated`
          : "no truncation",
    },
    {
      label: "Total cost",
      value: formatUsd(summary.totalCostUsd),
      hint: `${formatCompactNumber(
        summary.totalInputTokens
      )} in / ${formatCompactNumber(summary.totalOutputTokens)} out`,
    },
    {
      label: "Avg / p95 latency",
      value: `${formatLatencyMs(summary.avgLatencyMs)} / ${formatLatencyMs(
        summary.p95LatencyMs
      )}`,
    },
  ];
}

function shortDay(yyyyMmDd: string): string {
  // Parse as UTC noon to avoid TZ rollovers.
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function buildDaily(points: DailyUsagePoint[]): UsageDailyPoint[] {
  return points.map((p) => ({
    day: p.day,
    calls: p.calls,
    costUsd: p.costUsd,
    costLabel: formatUsd(p.costUsd),
    shortDay: shortDay(p.day),
  }));
}

function buildFailures(
  rows: RecentUsageFailure[],
  now: Date
): UsageFailureRow[] {
  return rows.map((r) => ({
    id: r.id,
    taskTypeLabel: r.taskType ?? "—",
    providerLabel: r.provider ?? "—",
    modelLabel: r.modelName ?? "—",
    errorCodeLabel: r.errorCode ?? "unknown",
    latencyLabel:
      r.latencyMs === null ? "—" : formatLatencyMs(r.latencyMs),
    occurredAtLabel: formatRelativeTime(r.occurredAt, now),
    reviewRunId: r.reviewRunId,
    pullRequestId: r.pullRequestId,
  }));
}

function buildRangeOptions(days: number): UsageRangeOption[] {
  const active = rangeKeyFromDays(days);
  return RANGES.map((r) => ({
    key: r.key,
    label: r.label,
    href: `/usage?range=${r.key}`,
    active: r.key === active,
  }));
}

export function buildUsageViewModel(args: {
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string };
  summary: UsageSummary;
  daily: DailyUsagePoint[];
  failures: RecentUsageFailure[];
  rangeDays: number;
  now?: Date;
}): UsageViewModel {
  const now = args.now ?? new Date();
  return {
    shell: buildShell("/usage"),
    topbar: {
      title: "Usage & cost",
      summary: "AI call governance and audit",
      searchPlaceholder: "",
      rangeLabel: RANGES.find((r) => r.days === args.rangeDays)?.label ?? "",
    },
    viewerName: getViewerName(args.user),
    range: {
      days: args.rangeDays,
      options: buildRangeOptions(args.rangeDays),
    },
    kpis: buildKpis(args.summary),
    daily: buildDaily(args.daily),
    failures: buildFailures(args.failures, now),
    hasData: args.summary.totalCalls > 0,
  };
}
