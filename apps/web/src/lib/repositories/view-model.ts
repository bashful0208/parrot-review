import type { AuthenticatedUser } from "@reviewer/core";
import type { RepositoryRow } from "@reviewer/core";

import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import type { DashboardShellModel, DashboardTopbarModel } from "@/lib/dashboard/types";

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

export interface ConnectPageViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
}

function getViewerName(user: Pick<AuthenticatedUser, "email" | "name">): string {
  if (user.name && user.name.trim().length > 0) return user.name;
  return user.email.split("@")[0];
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
      primaryAction: {
        label: "Connect Repository",
        description: "Connect a new repository",
        href: "/repositories/new",
      },
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

export function buildConnectPageViewModel(
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string }
): ConnectPageViewModel {
  return {
    shell: buildShell("/repositories"),
    topbar: {
      title: "Connect Repository",
      summary: "",
      searchPlaceholder: "",
      rangeLabel: "",
      primaryAction: {
        label: "View All",
        description: "Back to repositories",
        href: "/repositories",
      },
    },
    viewerName: getViewerName(user),
  };
}
