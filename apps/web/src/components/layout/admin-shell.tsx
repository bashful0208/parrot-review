"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/components/providers/app-provider";
import { SidebarInset } from "@/components/ui/sidebar";
import type {
  DashboardShellModel,
  DashboardTopbarModel,
} from "@/lib/dashboard/types";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";
import { SkipToMain } from "./skip-to-main";
import { mapNavigationToGroups } from "./sidebar-data";

export default function AdminShell({
  shell,
  topbar,
  viewerName,
  children,
}: {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  children: ReactNode;
}) {
  const navGroups = mapNavigationToGroups(shell.navigation);

  return (
    <AppProvider>
      <SkipToMain />
      <AdminSidebar
        navGroups={navGroups}
        viewerName={viewerName}
        workspaceName={shell.workspaceName}
        logoutHref={shell.logoutHref}
      />
      <SidebarInset className="@container/content">
        <AdminHeader topbar={topbar} />
        <main id="main-content" className="flex-1 px-4 pb-4 pt-3 sm:px-5 lg:px-6 lg:pb-6 lg:pt-4">
          {children}
        </main>
      </SidebarInset>
    </AppProvider>
  );
}
