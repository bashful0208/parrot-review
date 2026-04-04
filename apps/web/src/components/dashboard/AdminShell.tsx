import type { ReactNode } from "react";

import type {
  DashboardShellModel,
  DashboardTopbarModel,
} from "@/lib/dashboard/types";

import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import MobileSidebarSheet from "./MobileSidebarSheet";

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
  return (
    <main className="min-h-dvh bg-[var(--admin-background)] text-zinc-950">
      <a
        href="#overview-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-zinc-950"
      >
        Skip to overview content
      </a>
      <div className="mx-auto flex min-h-dvh w-full max-w-[1600px]">
        <AdminSidebar
          shell={shell}
          viewerName={viewerName}
          className="hidden lg:flex"
        />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <MobileSidebarSheet shell={shell} viewerName={viewerName} />
          <AdminTopbar topbar={topbar} />
          <div className="flex-1 px-4 pb-6 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
