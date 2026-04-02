import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_SESSION_COOKIE, getSessionUser } from "@reviewer/core";

import DashboardHero from "@/components/dashboard/DashboardHero";
import DashboardKpiGrid from "@/components/dashboard/DashboardKpiGrid";
import DashboardQuickActions from "@/components/dashboard/DashboardQuickActions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import RecentReviewRuns from "@/components/dashboard/RecentReviewRuns";
import RepositoryHealthList from "@/components/dashboard/RepositoryHealthList";
import RiskInsights from "@/components/dashboard/RiskInsights";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const dashboard = buildDashboardViewModel(user);

  return (
    <DashboardShell>
      <DashboardHero hero={dashboard.hero} />
      <DashboardKpiGrid kpis={dashboard.kpis} />
      <DashboardQuickActions actions={dashboard.quickActions} />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <RecentReviewRuns runs={dashboard.recentRuns} />
        <RepositoryHealthList repositories={dashboard.repositories} />
      </div>
      <RiskInsights insights={dashboard.insights} trend={dashboard.trend} />
    </DashboardShell>
  );
}
