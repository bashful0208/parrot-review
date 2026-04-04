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
          className="group rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-0.5"
        >
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
            Action
          </span>
          <p className="mt-4 text-lg font-semibold tracking-[-0.04em] text-zinc-950">
            {action.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{action.description}</p>
          <p className="mt-5 text-sm font-medium text-slate-900 group-hover:text-slate-700">
            Open
          </p>
        </a>
      ))}
    </section>
  );
}
