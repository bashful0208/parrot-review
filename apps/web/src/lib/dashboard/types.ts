export type DashboardRunStatus = "running" | "succeeded" | "failed" | "queued";
export type DashboardSeverity = "critical" | "high" | "medium" | "low";
export type RepositoryIntegrationStatus = "connected" | "attention" | "pending";

export interface DashboardHeroModel {
  organizationName: string;
  viewerName: string;
  title: string;
  summary: string;
}

export interface DashboardKpi {
  label: string;
  value: string;
  change: string;
}

export interface DashboardQuickAction {
  label: string;
  description: string;
  href: string;
}

export interface DashboardNavItem {
  label: string;
  href: string;
  icon:
    | "overview"
    | "repositories"
    | "runs"
    | "policies"
    | "team"
    | "settings"
    | "usage";
}

export interface DashboardShellModel {
  workspaceName: string;
  currentPath: string;
  logoutHref: string;
  navigation: DashboardNavItem[];
}

export interface DashboardTopbarModel {
  title: string;
  summary: string;
  searchPlaceholder: string;
  rangeLabel: string;
  primaryAction?: DashboardQuickAction;
}

export interface DashboardRun {
  id: string;
  repositoryName: string;
  pullRequestLabel: string;
  title: string;
  status: DashboardRunStatus;
  startedAtLabel: string;
  severityLabel: string;
}

export interface DashboardInsight {
  severity: DashboardSeverity;
  count: number;
}

export interface DashboardTrendPoint {
  label: string;
  value: number;
}

export interface RepositoryHealthItem {
  id: string;
  name: string;
  openFindings: number;
  lastReviewLabel: string;
  status: RepositoryIntegrationStatus;
}

export interface DashboardViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  hero: DashboardHeroModel;
  kpis: DashboardKpi[];
  quickActions: DashboardQuickAction[];
  recentRuns: DashboardRun[];
  insights: DashboardInsight[];
  trend: DashboardTrendPoint[];
  repositories: RepositoryHealthItem[];
}
