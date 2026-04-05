import { createHash } from "node:crypto";
import { Pool } from "pg";

import { AppError, ErrorCode } from "../errors.js";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new AppError(
        ErrorCode.DependencyDatabaseConnection,
        "DATABASE_URL is required for webhook processing"
      );
    }
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

export interface RepoIntegrationLookup {
  repository_id: string;
  organization_id: string;
  installation_id: string | null;
}

export async function findRepoIntegrationByProviderRepoId(
  provider: string,
  providerRepoId: string
): Promise<RepoIntegrationLookup | null> {
  const result = await getPool().query<RepoIntegrationLookup>(
    `select ri.repository_id, ri.organization_id, ri.installation_id
       from public.repo_integrations ri
       join public.repositories r on r.id = ri.repository_id
      where ri.provider = $1
        and r.provider_repo_id = $2
        and ri.status = 'active'
      limit 1`,
    [provider, providerRepoId]
  );
  return result.rows[0] ?? null;
}

export interface InsertWebhookEventInput {
  organizationId: string | null;
  repositoryId: string | null;
  provider: string;
  eventType: string;
  deliveryId: string;
  signatureValid: boolean;
  rawBody: string;
  payload: Record<string, unknown>;
}

export interface WebhookEventRecord {
  id: string;
}

/**
 * 写入 webhook 事件，返回 null 表示 delivery_id 重复（幂等保护）。
 */
export async function insertWebhookEvent(
  input: InsertWebhookEventInput
): Promise<WebhookEventRecord | null> {
  const payloadHash = createHash("sha256")
    .update(input.rawBody, "utf8")
    .digest("hex");

  const result = await getPool().query<WebhookEventRecord>(
    `insert into public.webhook_events
       (organization_id, repository_id, provider, event_type,
        delivery_id, signature_valid, payload_hash, status, payload)
     values ($1, $2, $3, $4, $5, $6, $7, 'received', $8)
     on conflict (provider, delivery_id) do nothing
     returning id`,
    [
      input.organizationId,
      input.repositoryId,
      input.provider,
      input.eventType,
      input.deliveryId,
      input.signatureValid,
      payloadHash,
      JSON.stringify(input.payload),
    ]
  );

  return result.rows[0] ?? null;
}
