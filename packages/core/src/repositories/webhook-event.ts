import { Pool } from "pg";

import { AppError, ErrorCode } from "../errors.js";
import { createLogger } from "../logging.js";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new AppError(
        ErrorCode.DependencyDatabaseConnection,
        "DATABASE_URL is required"
      );
    }
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

export interface WebhookEventRow {
  id: string;
  organizationId: string | null;
  repositoryId: string | null;
  repositoryFullName: string | null;
  provider: string;
  eventType: string;
  deliveryId: string | null;
  signatureValid: boolean;
  status: string;
  errorMessage: string | null;
  processedAt: Date | null;
  payloadHash: string;
  payloadSizeBytes: number;
  createdAt: Date;
}

export interface WebhookEventDetail extends WebhookEventRow {
  payload: unknown;
}

export interface ListWebhookEventsOptions {
  organizationId: string;
  sinceDays: number;
  provider?: "github" | "gitee" | null;
  page: number;
  perPage: number;
}

export interface ListWebhookEventsResult {
  rows: WebhookEventRow[];
  totalCount: number;
}

export interface WebhookEventStats {
  total: number;
  signatureInvalid: number;
  byProvider: Record<string, number>;
  topEventTypes: Array<{ eventType: string; count: number }>;
}

const PROVIDER_NORMALIZED = new Set(["github", "gitee", "gitlab"]);

function normalizeProviderFilter(
  provider: ListWebhookEventsOptions["provider"]
): string | null {
  if (!provider) return null;
  return PROVIDER_NORMALIZED.has(provider) ? provider : null;
}

export async function listWebhookEvents(
  opts: ListWebhookEventsOptions
): Promise<ListWebhookEventsResult> {
  const logger = createLogger({ component: "queue" });
  try {
    const provider = normalizeProviderFilter(opts.provider);
    const limit = Math.max(1, Math.min(opts.perPage, 200));
    const offset = Math.max(0, (opts.page - 1) * limit);

    const params: unknown[] = [opts.organizationId, opts.sinceDays];
    let providerFilter = "";
    if (provider) {
      params.push(provider);
      providerFilter = `and provider = $${params.length}::public.git_provider`;
    }

    const countResult = await getPool().query<{ total: string }>(
      `select count(*)::bigint as total
         from public.webhook_events
        where organization_id = $1
          and created_at >= now() - ($2::int * interval '1 day')
          ${providerFilter}`,
      params
    );
    const totalCount = Number(countResult.rows[0]?.total ?? 0);

    params.push(limit, offset);
    const result = await getPool().query<{
      id: string;
      organization_id: string | null;
      repository_id: string | null;
      repository_full_name: string | null;
      provider: string;
      event_type: string;
      delivery_id: string | null;
      signature_valid: boolean;
      status: string;
      error_message: string | null;
      processed_at: Date | null;
      payload_hash: string;
      payload_size_bytes: string;
      created_at: Date;
    }>(
      `select w.id, w.organization_id, w.repository_id,
              r.full_name as repository_full_name,
              w.provider, w.event_type, w.delivery_id, w.signature_valid,
              w.status, w.error_message, w.processed_at,
              w.payload_hash,
              octet_length(w.payload::text)::bigint as payload_size_bytes,
              w.created_at
         from public.webhook_events w
         left join public.repositories r on r.id = w.repository_id
        where w.organization_id = $1
          and w.created_at >= now() - ($2::int * interval '1 day')
          ${providerFilter}
        order by w.created_at desc
        limit $${params.length - 1} offset $${params.length}`,
      params
    );

    return {
      rows: result.rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        repositoryId: row.repository_id,
        repositoryFullName: row.repository_full_name,
        provider: row.provider,
        eventType: row.event_type,
        deliveryId: row.delivery_id,
        signatureValid: row.signature_valid,
        status: row.status,
        errorMessage: row.error_message,
        processedAt: row.processed_at,
        payloadHash: row.payload_hash,
        payloadSizeBytes: Number(row.payload_size_bytes),
        createdAt: row.created_at,
      })),
      totalCount,
    };
  } catch (error) {
    logger.error("Failed to list webhook events", error as Error, {
      operation: "list_webhook_events",
      organization_id: opts.organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to list webhook events"
    );
  }
}

export async function getWebhookEventDetail(
  id: string,
  organizationId: string
): Promise<WebhookEventDetail | null> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      id: string;
      organization_id: string | null;
      repository_id: string | null;
      repository_full_name: string | null;
      provider: string;
      event_type: string;
      delivery_id: string | null;
      signature_valid: boolean;
      status: string;
      error_message: string | null;
      processed_at: Date | null;
      payload_hash: string;
      payload: unknown;
      payload_size_bytes: string;
      created_at: Date;
    }>(
      `select w.id, w.organization_id, w.repository_id,
              r.full_name as repository_full_name,
              w.provider, w.event_type, w.delivery_id, w.signature_valid,
              w.status, w.error_message, w.processed_at,
              w.payload_hash, w.payload,
              octet_length(w.payload::text)::bigint as payload_size_bytes,
              w.created_at
         from public.webhook_events w
         left join public.repositories r on r.id = w.repository_id
        where w.id = $1
          and w.organization_id = $2`,
      [id, organizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      repositoryId: row.repository_id,
      repositoryFullName: row.repository_full_name,
      provider: row.provider,
      eventType: row.event_type,
      deliveryId: row.delivery_id,
      signatureValid: row.signature_valid,
      status: row.status,
      errorMessage: row.error_message,
      processedAt: row.processed_at,
      payloadHash: row.payload_hash,
      payloadSizeBytes: Number(row.payload_size_bytes),
      payload: row.payload,
      createdAt: row.created_at,
    };
  } catch (error) {
    logger.error("Failed to fetch webhook event detail", error as Error, {
      operation: "get_webhook_event_detail",
      organization_id: organizationId,
      webhook_event_id: id,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to fetch webhook event detail"
    );
  }
}

export async function getWebhookEventStats(
  organizationId: string,
  sinceDays: number
): Promise<WebhookEventStats> {
  const logger = createLogger({ component: "queue" });
  try {
    const totals = await getPool().query<{
      total: string;
      signature_invalid: string;
      provider: string;
      provider_count: string;
    }>(
      `select count(*)::bigint as total,
              count(*) filter (where signature_valid is false)::bigint as signature_invalid,
              provider::text as provider,
              count(*)::bigint as provider_count
         from public.webhook_events
        where organization_id = $1
          and created_at >= now() - ($2::int * interval '1 day')
        group by provider`,
      [organizationId, sinceDays]
    );

    let total = 0;
    let signatureInvalid = 0;
    const byProvider: Record<string, number> = {};
    for (const row of totals.rows) {
      const count = Number(row.provider_count ?? 0);
      byProvider[row.provider] = count;
      total += count;
      signatureInvalid += Number(row.signature_invalid ?? 0);
    }

    const top = await getPool().query<{ event_type: string; cnt: string }>(
      `select event_type, count(*)::bigint as cnt
         from public.webhook_events
        where organization_id = $1
          and created_at >= now() - ($2::int * interval '1 day')
        group by event_type
        order by cnt desc
        limit 5`,
      [organizationId, sinceDays]
    );

    return {
      total,
      signatureInvalid,
      byProvider,
      topEventTypes: top.rows.map((row) => ({
        eventType: row.event_type,
        count: Number(row.cnt),
      })),
    };
  } catch (error) {
    logger.error("Failed to compute webhook event stats", error as Error, {
      operation: "get_webhook_event_stats",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to compute webhook event stats"
    );
  }
}
