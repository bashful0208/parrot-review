import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getDailyUsageStats,
  getOpenFindingsCount,
  getOrgIdForUser,
  getOrganizationName,
  getRepositoryHealthItems,
  getReviewRunCount,
  getReviewRunSuccessRate,
  getSessionUser,
  getUsageSummary,
  listRecentReviewRuns,
  listRepositoriesByOrganization,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import DashboardHero from "@/components/dashboard/DashboardHero";
import DashboardUsageOverview from "@/components/dashboard/DashboardUsageOverview";
import OverviewContent from "@/components/dashboard/OverviewContent";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

function emptyUsageSummary() {
  return {
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    truncatedCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
  };
}

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);

  if (!orgId) {
    const dashboard = buildDashboardViewModel({
      user,
      orgName: "Reviewer",
      repoCount: 0,
      reviewRunCount: 0,
      openFindingsCount: 0,
      successRate: 0,
      repoHealthRows: [],
      usageSummary: emptyUsageSummary(),
      usageDaily: [],
      recentRunRows: [],
    });
    return (
      <AdminShell
        shell={dashboard.shell}
        topbar={dashboard.topbar}
        viewerName={dashboard.hero.viewerName}
      >
        <div className="space-y-4">
          <DashboardHero hero={dashboard.hero} />
          <OverviewContent dashboard={dashboard} />
          <DashboardUsageOverview usage={dashboard.usage} />
        </div>
      </AdminShell>
    );
  }

  const [
    orgName,
    repos,
    repoHealthRows,
    reviewRunCount,
    successRateResult,
    openFindingsCount,
    recentRunRows,
    usageSummary,
    usageDaily,
  ] = await Promise.all([
    getOrganizationName(orgId).then((n) => n ?? "Reviewer"),
    listRepositoriesByOrganization(orgId),
    getRepositoryHealthItems(orgId),
    getReviewRunCount(orgId, 7),
    getReviewRunSuccessRate(orgId, 7),
    getOpenFindingsCount(orgId),
    listRecentReviewRuns(orgId, 5),
    getUsageSummary(orgId, 7),
    getDailyUsageStats(orgId, 7),
  ]);

  const dashboard = buildDashboardViewModel({
    user,
    orgName,
    repoCount: repos.length,
    reviewRunCount,
    openFindingsCount,
    successRate: successRateResult.rate,
    repoHealthRows,
    recentRunRows,
    usageSummary,
    usageDaily,
  });

  return (
    <AdminShell
      shell={dashboard.shell}
      topbar={dashboard.topbar}
      viewerName={dashboard.hero.viewerName}
    >
      <div className="space-y-4">
        <DashboardHero hero={dashboard.hero} />
        <OverviewContent dashboard={dashboard} />
        <DashboardUsageOverview usage={dashboard.usage} />
      </div>
    </AdminShell>
  );
}
