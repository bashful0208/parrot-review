import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getSessionUser,
  getWebhookEventStats,
  listWebhookEvents,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import WebhookEventsTable from "@/components/webhooks/WebhookEventsTable";
import WebhookFilters from "@/components/webhooks/WebhookFilters";
import WebhookKpiGrid from "@/components/webhooks/WebhookKpiGrid";
import WebhookPagination from "@/components/webhooks/WebhookPagination";
import {
  parseWebhookPage,
  parseWebhookProvider,
  parseWebhookRangeDays,
} from "@/lib/webhooks/format";
import { buildWebhooksListViewModel } from "@/lib/webhooks/view-model";

const PER_PAGE = 50;

const EMPTY_STATS = {
  total: 0,
  signatureInvalid: 0,
  byProvider: {} as Record<string, number>,
  byStatus: {} as Record<string, number>,
  topEventTypes: [] as Array<{ eventType: string; count: number }>,
};

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; provider?: string; page?: string }>;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  const sp = await searchParams;
  const days = parseWebhookRangeDays(sp.range);
  const provider = parseWebhookProvider(sp.provider);
  const page = parseWebhookPage(sp.page);

  const [stats, list] = orgId
    ? await Promise.all([
        getWebhookEventStats(orgId, days),
        listWebhookEvents({
          organizationId: orgId,
          sinceDays: days,
          provider,
          page,
          perPage: PER_PAGE,
        }),
      ])
    : [EMPTY_STATS, { rows: [], totalCount: 0 }];

  const vm = buildWebhooksListViewModel({
    user,
    stats,
    events: list.rows,
    totalCount: list.totalCount,
    rangeDays: days,
    provider,
    page,
    perPage: PER_PAGE,
  });

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <div className="space-y-4">
        <WebhookFilters
          rangeOptions={vm.filters.rangeOptions}
          providerOptions={vm.filters.providerOptions}
        />
        <WebhookKpiGrid kpis={vm.kpis} />
        <WebhookEventsTable rows={vm.rows} />
        <WebhookPagination pagination={vm.pagination} />
      </div>
    </AdminShell>
  );
}
