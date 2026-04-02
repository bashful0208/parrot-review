import type { DashboardHeroModel } from "@/lib/dashboard/types";

export default function DashboardHero({ hero }: { hero: DashboardHeroModel }) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-700">
            {hero.organizationName}
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-zinc-950 sm:text-5xl">
            {hero.title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
            {hero.summary}
          </p>
        </div>
        <div className="rounded-[24px] border border-sky-100 bg-sky-50/80 px-5 py-4 text-sm text-sky-900">
          <span className="block text-xs uppercase tracking-[0.24em] text-sky-700">
            Signed in as
          </span>
          <strong className="mt-1 block text-base font-semibold">{hero.viewerName}</strong>
        </div>
      </div>
    </section>
  );
}
