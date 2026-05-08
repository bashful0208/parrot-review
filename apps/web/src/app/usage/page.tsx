import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getDailyUsageStats,
  getOrgIdForUser,
  getRecentUsageFailures,
  getSessionUser,
  getUsageSummary,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import UsageDailyCostChart from "@/components/usage/UsageDailyCostChart";
import UsageFailuresTable from "@/components/usage/UsageFailuresTable";
import UsageKpiGrid from "@/components/usage/UsageKpiGrid";
import UsageRangeTabs from "@/components/usage/UsageRangeTabs";
import { parseUsageRangeDays } from "@/lib/usage/format";
import { buildUsageViewModel } from "@/lib/usage/view-model";

const FAILURES_LIMIT = 30;

const EMPTY_SUMMARY = {
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

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  const sp = await searchParams;
  const days = parseUsageRangeDays(sp.range);

  const [summary, daily, failures] = orgId
    ? await Promise.all([
        getUsageSummary(orgId, days),
        getDailyUsageStats(orgId, days),
        getRecentUsageFailures(orgId, FAILURES_LIMIT),
      ])
    : [EMPTY_SUMMARY, [], []];

  const vm = buildUsageViewModel({
    user,
    summary,
    daily,
    failures,
    rangeDays: days,
  });

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Audit every AI call: latency, tokens, cost, and failure reason.
          </p>
          <UsageRangeTabs options={vm.range.options} />
        </div>

        <UsageKpiGrid kpis={vm.kpis} />
        <UsageDailyCostChart points={vm.daily} />
        <UsageFailuresTable rows={vm.failures} />
      </div>
    </AdminShell>
  );
}
