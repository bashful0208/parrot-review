import type { AuthenticatedUser, RepositoryDetailRow } from "@reviewer/core";

import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import type { DashboardShellModel, DashboardTopbarModel } from "@/lib/dashboard/types";

export interface RepositoryDetailItem {
  id: string;
  fullName: string;
  provider: string;
  defaultBranch: string;
  status: string;
  createdAtLabel: string;
  webhookUrl: string;
  webhookSecret: string;
}

export interface RepositoryDetailViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  repository: RepositoryDetailItem;
}

export function buildRepositoryDetailViewModel(
  row: RepositoryDetailRow,
  webhookUrl: string
): RepositoryDetailItem {
  return {
    id: row.id,
    fullName: row.full_name,
    provider: row.provider,
    defaultBranch: row.default_branch,
    status: row.status,
    createdAtLabel: new Date(row.created_at).toISOString().slice(0, 10),
    webhookUrl,
    webhookSecret: row.webhook_secret,
  };
}

function getViewerName(user: Pick<AuthenticatedUser, "email" | "name">): string {
  if (user.name && user.name.trim().length > 0) return user.name;
  return user.email.split("@")[0];
}

export function buildRepositoryDetailPageViewModel(
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string },
  row: RepositoryDetailRow,
  webhookUrl: string
): RepositoryDetailViewModel {
  return {
    shell: {
      workspaceName: "Acme Engineering",
      currentPath: "/repositories",
      logoutHref: "/api/auth/logout",
      navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
    },
    topbar: {
      title: row.full_name,
      summary: "",
      searchPlaceholder: "",
      rangeLabel: "",
    },
    viewerName: getViewerName(user),
    repository: buildRepositoryDetailViewModel(row, webhookUrl),
  };
}
