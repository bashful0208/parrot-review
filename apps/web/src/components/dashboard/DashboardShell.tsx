import type { ReactNode } from "react";

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(132,204,255,0.20),_transparent_28%),linear-gradient(180deg,#eef4ff_0%,#f8fafc_42%,#f4f7fb_100%)] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
    </main>
  );
}
