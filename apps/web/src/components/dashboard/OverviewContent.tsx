import type { DashboardViewModel } from "@/lib/dashboard/types";

import DashboardKpiGrid from "./DashboardKpiGrid";
import DashboardQuickActions from "./DashboardQuickActions";
import RecentReviewRuns from "./RecentReviewRuns";
import RepositoryHealthList from "./RepositoryHealthList";
import RiskInsights from "./RiskInsights";

export default function OverviewContent({
  dashboard,
}: {
  dashboard: DashboardViewModel;
}) {
  return (
    <section id="overview-content" className="space-y-6 lg:space-y-7">
      <DashboardKpiGrid kpis={dashboard.kpis} />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <RecentReviewRuns runs={dashboard.recentRuns} />
        <RepositoryHealthList repositories={dashboard.repositories} />
      </div>
      <RiskInsights insights={dashboard.insights} trend={dashboard.trend} />
      <DashboardQuickActions actions={dashboard.quickActions} />
    </section>
  );
}
