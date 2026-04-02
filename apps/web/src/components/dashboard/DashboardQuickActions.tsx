import type { DashboardQuickAction } from "@/lib/dashboard/types";

export default function DashboardQuickActions({
  actions,
}: {
  actions: DashboardQuickAction[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          className="group rounded-[24px] border border-white/70 bg-white/90 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-0.5"
        >
          <p className="text-lg font-semibold tracking-[-0.04em] text-zinc-950">
            {action.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{action.description}</p>
          <p className="mt-4 text-sm font-medium text-sky-700 group-hover:text-sky-800">
            Open
          </p>
        </a>
      ))}
    </section>
  );
}
