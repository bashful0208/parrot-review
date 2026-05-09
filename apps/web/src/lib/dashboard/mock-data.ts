import type {
  DashboardRun,
  RepositoryHealthItem,
} from "./types";

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

export function createEmptyDashboardCollections() {
  return {
    recentRuns: [] as DashboardRun[],
    repositories: [] as RepositoryHealthItem[],
  };
}
