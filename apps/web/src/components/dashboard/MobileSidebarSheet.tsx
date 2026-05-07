"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { DashboardNavItem, DashboardShellModel } from "@/lib/dashboard/types";

function CompactIcon({ icon }: { icon: DashboardNavItem["icon"] }) {
  const labels: Record<DashboardNavItem["icon"], string> = {
    overview: "OV",
    repositories: "RE",
    runs: "RU",
    settings: "SE",
    usage: "US",
    webhooks: "WH",
  };

  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold tracking-[0.14em] text-slate-700">
      {labels[icon]}
    </span>
  );
}

export default function MobileSidebarSheet({
  shell,
  viewerName,
}: {
  shell: DashboardShellModel;
  viewerName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const navigationId = "mobile-navigation";

  return (
    <div className="border-b border-slate-200/80 bg-white/95 px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          aria-label="Open navigation menu"
          aria-expanded={isOpen}
          aria-controls={navigationId}
          onClick={() => setIsOpen((open) => !open)}
          className="min-h-11 border-slate-200 bg-white px-3 text-sm text-zinc-700"
        >
          Menu
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium text-zinc-900">
            {shell.workspaceName}
          </p>
          <p className="truncate text-xs text-zinc-500">{viewerName}</p>
        </div>
        <form action={shell.logoutHref} method="post">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center text-sm font-medium text-slate-700"
          >
            Log out
          </button>
        </form>
      </div>

      <div
        id={navigationId}
        hidden={!isOpen}
        className="mt-3 flex gap-2 overflow-x-auto pb-1"
      >
        {shell.navigation.map((item) => {
          const active = item.href === shell.currentPath;

          return (
            <a
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm",
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700",
              ].join(" ")}
            >
              <CompactIcon icon={item.icon} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
