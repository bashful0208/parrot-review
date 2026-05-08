import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getSessionUser,
  listRecentReviewRuns,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import DashboardHero from "@/components/dashboard/DashboardHero";
import DashboardKpiGrid from "@/components/dashboard/DashboardKpiGrid";
import RecentReviewRuns from "@/components/dashboard/RecentReviewRuns";
import RepositoryHealthList from "@/components/dashboard/RepositoryHealthList";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  const recentRunRows = orgId
    ? await listRecentReviewRuns(orgId, 5)
    : [];
  const dashboard = buildDashboardViewModel(user, recentRunRows);

  return (
    <AdminShell
      shell={dashboard.shell}
      topbar={dashboard.topbar}
      viewerName={dashboard.hero.viewerName}
    >
      <div className="space-y-4">
        <DashboardHero hero={dashboard.hero} />
        <DashboardKpiGrid kpis={dashboard.kpis} />
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <RecentReviewRuns runs={dashboard.recentRuns} />
          <RepositoryHealthList repositories={dashboard.repositories} />
        </div>
      </div>
    </AdminShell>
  );
}
