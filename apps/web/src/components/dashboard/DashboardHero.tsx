import type { DashboardHeroModel } from "@/lib/dashboard/types";

export default function DashboardHero({ hero }: { hero: DashboardHeroModel }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/70 bg-white/85 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-sky-700">
            {hero.organizationName}
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950 sm:text-3xl">
            {hero.title}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600">
            {hero.summary}
          </p>
        </div>
        <div className="rounded-[16px] border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
          <span className="block text-xs uppercase tracking-[0.24em] text-sky-700">
            Signed in as
          </span>
          <strong className="mt-1 block text-base font-semibold">{hero.viewerName}</strong>
        </div>
      </div>
    </section>
  );
}
