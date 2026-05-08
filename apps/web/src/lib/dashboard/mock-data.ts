import type {
  DashboardKpi,
  DashboardRun,
  RepositoryHealthItem,
} from "./types";

export const DASHBOARD_KPIS: DashboardKpi[] = [
  { label: "Active Repositories", value: "12", change: "+2 this month" },
  { label: "Reviews This Week", value: "48", change: "+18% vs last week" },
  { label: "Open Findings", value: "19", change: "5 critical require review" },
  { label: "Success Rate", value: "96%", change: "Stable over 30 days" },
];

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

export const DASHBOARD_REPOSITORIES: RepositoryHealthItem[] = [
  {
    id: "repo_1",
    name: "reviewer/web",
    openFindings: 7,
    lastReviewLabel: "Last review 22m ago",
    status: "connected",
  },
  {
    id: "repo_2",
    name: "reviewer/core",
    openFindings: 5,
    lastReviewLabel: "Last review 58m ago",
    status: "connected",
  },
  {
    id: "repo_3",
    name: "reviewer/worker",
    openFindings: 7,
    lastReviewLabel: "Health check pending",
    status: "attention",
  },
];

export function createEmptyDashboardCollections() {
  return {
    recentRuns: [] as DashboardRun[],
    repositories: [] as RepositoryHealthItem[],
  };
}
