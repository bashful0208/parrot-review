"use client";

import type { DashboardTopbarModel } from "@/lib/dashboard/types";

export function AdminHeader({ topbar }: { topbar: DashboardTopbarModel }) {
  return (
    <header className="z-50 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 backdrop-blur-lg sm:gap-4">
      <div className="flex w-full items-center gap-3 p-4 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            {topbar.title}
          </h1>
          {topbar.summary && (
            <p className="text-sm text-muted-foreground">{topbar.summary}</p>
          )}
        </div>
      </div>
    </header>
  );
}
