import type { AuthenticatedUser } from "@reviewer/core";
import type { RepositoryRow } from "@reviewer/core";

import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import type { DashboardShellModel, DashboardTopbarModel } from "@/lib/dashboard/types";
import { getViewerName } from "@/lib/utils/viewer-name";

export interface RepositoryItem {
  id: string;
  name: string;
  fullName: string;
  provider: string;
  status: string;
  createdAtLabel: string;
}

export interface RepositoriesViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  repositories: RepositoryItem[];
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function buildShell(currentPath: string): DashboardShellModel {
  return {
    workspaceName: "Acme Engineering",
    currentPath,
    logoutHref: "/api/auth/logout",
    navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
  };
}

export function buildRepositoriesViewModel(
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string },
  rows: RepositoryRow[]
): RepositoriesViewModel {
  return {
    shell: buildShell("/repositories"),
    topbar: {
      title: "Repositories",
      summary: "",
      searchPlaceholder: "Search repositories",
      rangeLabel: "",
    },
    viewerName: getViewerName(user),
    repositories: rows.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      provider: r.provider,
      status: r.status,
      createdAtLabel: `Connected ${formatDate(new Date(r.created_at))}`,
    })),
  };
}

