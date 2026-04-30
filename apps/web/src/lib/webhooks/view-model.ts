import type { AuthenticatedUser } from "@reviewer/core";
import type {
  WebhookEventDetail,
  WebhookEventRow,
  WebhookEventStats,
} from "@reviewer/core";

import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import type { DashboardShellModel, DashboardTopbarModel } from "@/lib/dashboard/types";
import { formatRelativeTime } from "@/lib/usage/format";
import { getViewerName } from "@/lib/utils/viewer-name";

import {
  buildWebhooksHref,
  formatPayloadSize,
  rangeKeyFromDays,
  type WebhookProvider,
  type WebhookRangeKey,
} from "./format";

export interface WebhookKpi {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}

export interface WebhookRangeOption {
  key: WebhookRangeKey;
  label: string;
  href: string;
  active: boolean;
}

export interface WebhookProviderOption {
  key: "all" | WebhookProvider;
  label: string;
  href: string;
  active: boolean;
}

export interface WebhookListRow {
  id: string;
  occurredAtLabel: string;
  occurredAtFull: string;
  provider: string;
  eventType: string;
  signatureValid: boolean;
  signatureLabel: string;
  status: string;
  deliveryIdShort: string;
  deliveryIdFull: string | null;
  repositoryFullName: string | null;
  payloadSizeLabel: string;
  detailHref: string;
}

export interface WebhookPaginationModel {
  page: number;
  perPage: number;
  totalCount: number;
  rangeLabel: string;
  prevHref: string | null;
  nextHref: string | null;
}

export interface WebhooksListViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  filters: {
    rangeOptions: WebhookRangeOption[];
    providerOptions: WebhookProviderOption[];
  };
  kpis: WebhookKpi[];
  rows: WebhookListRow[];
  pagination: WebhookPaginationModel;
  hasData: boolean;
}

export interface WebhookDetailViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  meta: Array<{ label: string; value: string }>;
  payloadJson: string;
  payloadSizeLabel: string;
  errorMessage: string | null;
  signatureValid: boolean;
  status: string;
  provider: string;
  eventType: string;
  backHref: string;
}

function buildShell(currentPath: string): DashboardShellModel {
  return {
    workspaceName: "Acme Engineering",
    currentPath,
    logoutHref: "/api/auth/logout",
    navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
  };
}

const RANGES: Array<{ key: WebhookRangeKey; label: string; days: number }> = [
  { key: "24h", label: "Last 24h", days: 1 },
  { key: "7d", label: "Last 7d", days: 7 },
  { key: "30d", label: "Last 30d", days: 30 },
];

const PROVIDERS: Array<{ key: "all" | WebhookProvider; label: string }> = [
  { key: "all", label: "All" },
  { key: "github", label: "GitHub" },
  { key: "gitee", label: "Gitee" },
];

function buildRangeOptions(
  days: number,
  provider: WebhookProvider | null
): WebhookRangeOption[] {
  const active = rangeKeyFromDays(days);
  return RANGES.map((r) => ({
    key: r.key,
    label: r.label,
    href: buildWebhooksHref({
      range: r.key,
      provider: provider ?? "all",
    }),
    active: r.key === active,
  }));
}

function buildProviderOptions(
  days: number,
  active: WebhookProvider | null
): WebhookProviderOption[] {
  const range = rangeKeyFromDays(days);
  return PROVIDERS.map((p) => ({
    key: p.key,
    label: p.label,
    href: buildWebhooksHref({ range, provider: p.key }),
    active:
      (p.key === "all" && active === null) ||
      (p.key !== "all" && p.key === active),
  }));
}

function shortDeliveryId(s: string | null): string {
  if (!s) return "—";
  if (s.length <= 14) return s;
  return `${s.slice(0, 12)}…`;
}

function formatAbsolute(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\..*$/, " UTC");
}

function buildKpis(stats: WebhookEventStats): WebhookKpi[] {
  const top = stats.topEventTypes[0];
  return [
    { label: "Total events", value: String(stats.total) },
    {
      label: "Signature failures",
      value: String(stats.signatureInvalid),
      tone: stats.signatureInvalid > 0 ? "warn" : "default",
    },
    {
      label: "By provider",
      value: `${stats.byProvider.github ?? 0} / ${stats.byProvider.gitee ?? 0}`,
      hint: "github / gitee",
    },
    {
      label: "Top event",
      value: top ? top.eventType : "—",
      hint: top ? `${top.count}` : undefined,
    },
  ];
}

function buildRow(row: WebhookEventRow, now: Date): WebhookListRow {
  return {
    id: row.id,
    occurredAtLabel: formatRelativeTime(row.createdAt, now),
    occurredAtFull: formatAbsolute(row.createdAt),
    provider: row.provider,
    eventType: row.eventType,
    signatureValid: row.signatureValid,
    signatureLabel: row.signatureValid ? "valid" : "invalid",
    status: row.status,
    deliveryIdShort: shortDeliveryId(row.deliveryId),
    deliveryIdFull: row.deliveryId,
    repositoryFullName: row.repositoryFullName,
    payloadSizeLabel: formatPayloadSize(row.payloadSizeBytes),
    detailHref: `/webhooks/${row.id}`,
  };
}

function buildPagination(args: {
  page: number;
  perPage: number;
  totalCount: number;
  range: WebhookRangeKey;
  provider: WebhookProvider | null;
}): WebhookPaginationModel {
  const totalPages = Math.max(
    1,
    Math.ceil(args.totalCount / args.perPage)
  );
  const safePage = Math.min(Math.max(args.page, 1), totalPages);
  const start = args.totalCount === 0 ? 0 : (safePage - 1) * args.perPage + 1;
  const end = Math.min(safePage * args.perPage, args.totalCount);
  return {
    page: safePage,
    perPage: args.perPage,
    totalCount: args.totalCount,
    rangeLabel:
      args.totalCount === 0
        ? "No events"
        : `Showing ${start}–${end} of ${args.totalCount}`,
    prevHref:
      safePage > 1
        ? buildWebhooksHref({
            range: args.range,
            provider: args.provider ?? "all",
            page: safePage - 1,
          })
        : null,
    nextHref:
      safePage < totalPages
        ? buildWebhooksHref({
            range: args.range,
            provider: args.provider ?? "all",
            page: safePage + 1,
          })
        : null,
  };
}

export function buildWebhooksListViewModel(args: {
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string };
  stats: WebhookEventStats;
  events: WebhookEventRow[];
  totalCount: number;
  rangeDays: number;
  provider: WebhookProvider | null;
  page: number;
  perPage: number;
  now?: Date;
}): WebhooksListViewModel {
  const now = args.now ?? new Date();
  const rangeKey = rangeKeyFromDays(args.rangeDays);
  return {
    shell: buildShell("/webhooks"),
    topbar: {
      title: "Webhooks",
      summary: "Inbound webhook events received from connected providers",
      searchPlaceholder: "",
      rangeLabel: RANGES.find((r) => r.key === rangeKey)?.label ?? "",
    },
    viewerName: getViewerName(args.user),
    filters: {
      rangeOptions: buildRangeOptions(args.rangeDays, args.provider),
      providerOptions: buildProviderOptions(args.rangeDays, args.provider),
    },
    kpis: buildKpis(args.stats),
    rows: args.events.map((row) => buildRow(row, now)),
    pagination: buildPagination({
      page: args.page,
      perPage: args.perPage,
      totalCount: args.totalCount,
      range: rangeKey,
      provider: args.provider,
    }),
    hasData: args.totalCount > 0,
  };
}

export function buildWebhookDetailViewModel(args: {
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string };
  detail: WebhookEventDetail;
}): WebhookDetailViewModel {
  const { detail } = args;
  const meta: Array<{ label: string; value: string }> = [
    { label: "Provider", value: detail.provider },
    { label: "Event type", value: detail.eventType },
    { label: "Delivery ID", value: detail.deliveryId ?? "—" },
    {
      label: "Signature",
      value: detail.signatureValid ? "valid" : "invalid",
    },
    { label: "Status", value: detail.status },
    { label: "Received at", value: formatAbsolute(detail.createdAt) },
    {
      label: "Processed at",
      value: detail.processedAt ? formatAbsolute(detail.processedAt) : "—",
    },
    {
      label: "Repository",
      value: detail.repositoryFullName ?? "—",
    },
    {
      label: "Payload size",
      value: formatPayloadSize(detail.payloadSizeBytes),
    },
    { label: "Payload sha256", value: detail.payloadHash },
  ];
  return {
    shell: buildShell("/webhooks"),
    topbar: {
      title: `Webhook · ${detail.eventType}`,
      summary: `Received from ${detail.provider}`,
      searchPlaceholder: "",
      rangeLabel: "",
    },
    viewerName: getViewerName(args.user),
    meta,
    payloadJson: JSON.stringify(detail.payload, null, 2),
    payloadSizeLabel: formatPayloadSize(detail.payloadSizeBytes),
    errorMessage: detail.errorMessage,
    signatureValid: detail.signatureValid,
    status: detail.status,
    provider: detail.provider,
    eventType: detail.eventType,
    backHref: "/webhooks",
  };
}
