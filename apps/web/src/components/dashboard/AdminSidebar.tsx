import type { DashboardNavItem, DashboardShellModel } from "@/lib/dashboard/types";

function NavigationIcon({ icon }: { icon: DashboardNavItem["icon"] }) {
  const paths: Record<DashboardNavItem["icon"], string> = {
    overview: "M4 6.5h16M4 12h16M4 17.5h10",
    repositories: "M5 7.5h14v9H5z M8 5.5h8",
    runs: "M7 6.5v11m5-7v7m5-11v11",
    policies: "M12 4.5l6 2.5v4.5c0 3.7-2.5 6.3-6 8-3.5-1.7-6-4.3-6-8V7z",
    team: "M8.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm7 1a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M4.5 18c.6-2.6 2.6-4 5-4s4.4 1.4 5 4 M13.5 18c.3-1.5 1.3-2.6 3-3.1",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0-4 1 1.8 2.2.4.9 2 1.7 1.3-1.7 1.3-.9 2-2.2.4L12 19.5l-1.9-1.8-2.2-.4-.9-2-1.7-1.3 1.7-1.3.9-2 2.2-.4z",
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
        "w-72 shrink-0 flex-col border-r border-white/10 bg-[var(--admin-sidebar)] text-white",
        className,
      ].join(" ")}
    >
      <div className="border-b border-white/10 px-6 py-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
          Workspace
        </p>
        <h2 className="mt-3 text-lg font-semibold tracking-[-0.03em]">
          {shell.workspaceName}
        </h2>
        <p className="mt-1 text-sm text-slate-400">Operational review console</p>
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

      <div className="border-t border-white/10 px-4 py-4">
        <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
            Signed in as
          </p>
          <p className="mt-2 text-sm font-medium text-white">{viewerName}</p>
          <form action={shell.logoutHref} method="post" className="mt-4">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center text-sm text-slate-300 transition-colors hover:text-white"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
