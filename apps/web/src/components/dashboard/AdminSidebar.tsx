import type { DashboardNavItem, DashboardShellModel } from "@/lib/dashboard/types";

function NavigationIcon({ icon }: { icon: DashboardNavItem["icon"] }) {
  const paths: Record<DashboardNavItem["icon"], string> = {
    overview: "M4 6.5h16M4 12h16M4 17.5h10",
    repositories: "M5 7.5h14v9H5z M8 5.5h8",
    runs: "M7 6.5v11m5-7v7m5-11v11",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0-4 1 1.8 2.2.4.9 2 1.7 1.3-1.7 1.3-.9 2-2.2.4L12 19.5l-1.9-1.8-2.2-.4-.9-2-1.7-1.3 1.7-1.3.9-2 2.2-.4z",
    usage: "M5 19V5 M5 19h14 M9 15v-4 M13 15V9 M17 15v-7",
    webhooks: "M7 16a4 4 0 1 0 4-4 M17 8a4 4 0 1 0-4 4 M9 13l-3 5 M15 11l3-5 M11 14h6",
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4 shrink-0 stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[icon]} />
    </svg>
  );
}

export default function AdminSidebar({
  shell,
  viewerName,
  className = "",
}: {
  shell: DashboardShellModel;
  viewerName: string;
  className?: string;
}) {
  return (
    <aside
      className={[
        "w-56 shrink-0 self-start border-r border-white/10 bg-[var(--admin-sidebar)] text-white lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto",
        className,
      ].join(" ")}
    >
      <div className="flex h-full min-h-full flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="parrot-review logo" className="h-8 w-8 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight text-white">parrot-review</p>
              <p className="text-[11px] text-slate-400">{shell.workspaceName}</p>
            </div>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 space-y-1.5 px-3 py-4">
          {shell.navigation.map((item) => {
            const active = item.href === shell.currentPath;

            return (
              <a
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                  active
                    ? "bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.2)]"
                    : "text-slate-300 hover:bg-white/8 hover:text-white",
                ].join(" ")}
              >
                <NavigationIcon icon={item.icon} />
                <span className="font-medium">{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold uppercase text-white">
              {viewerName.slice(0, 1)}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
              {viewerName}
            </p>
            <form action={shell.logoutHref} method="post">
              <button
                type="submit"
                title="Log out"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
