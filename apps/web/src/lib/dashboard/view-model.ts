import type { AuthenticatedUser } from "@reviewer/core";

import {
  DASHBOARD_INSIGHTS,
  DASHBOARD_KPIS,
  DASHBOARD_QUICK_ACTIONS,
  DASHBOARD_RECENT_RUNS,
  DASHBOARD_REPOSITORIES,
  DASHBOARD_TREND,
} from "./mock-data";
import type { DashboardNavItem, DashboardViewModel } from "./types";
import { getViewerName } from "@/lib/utils/viewer-name";

export const DASHBOARD_NAVIGATION: DashboardNavItem[] = [
  { label: "Overview", href: "/", icon: "overview" },
  { label: "Repositories", href: "/repositories", icon: "repositories" },
  { label: "Review Runs", href: "/review-runs", icon: "runs" },
  { label: "Policies", href: "/policies", icon: "policies" },
  { label: "Team", href: "/team", icon: "team" },
  { label: "Usage", href: "/usage", icon: "usage" },
  { label: "Settings", href: "/settings/providers", icon: "settings" },
];

function cloneItems<T extends object>(items: T[]): T[] {
  return items.map((item) => ({ ...item }));
}

export function buildDashboardViewModel(
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string }
): DashboardViewModel {
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
      primaryAction: { ...DASHBOARD_QUICK_ACTIONS[0]! },
    },
    hero: {
      organizationName: "Acme Engineering",
      viewerName: getViewerName(user),
      title: "Your review workspace is in motion.",
      summary:
        "Track repository health, continue active reviews, and surface the findings that need attention first.",
    },
    kpis: cloneItems(DASHBOARD_KPIS),
    quickActions: cloneItems(DASHBOARD_QUICK_ACTIONS),
    recentRuns: cloneItems(DASHBOARD_RECENT_RUNS),
    insights: cloneItems(DASHBOARD_INSIGHTS),
    trend: cloneItems(DASHBOARD_TREND),
    repositories: cloneItems(DASHBOARD_REPOSITORIES),
  };
}
