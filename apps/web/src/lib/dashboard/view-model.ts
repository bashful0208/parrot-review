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
