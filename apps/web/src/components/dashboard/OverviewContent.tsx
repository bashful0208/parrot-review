import type { DashboardViewModel } from "@/lib/dashboard/types";

import DashboardKpiGrid from "./DashboardKpiGrid";
import RecentReviewRuns from "./RecentReviewRuns";
import RepositoryHealthList from "./RepositoryHealthList";

export default function OverviewContent({
  dashboard,
}: {
  dashboard: DashboardViewModel;
}) {
  return (
    <section id="overview-content" className="space-y-4">
      <DashboardKpiGrid kpis={dashboard.kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <RecentReviewRuns runs={dashboard.recentRuns} />
        <RepositoryHealthList repositories={dashboard.repositories} />
      </div>
    </section>
  );
}
