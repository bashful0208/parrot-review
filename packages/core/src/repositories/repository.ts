import { Pool, PoolClient } from "pg";

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

export interface RepositoryRow {
  id: string;
  name: string;
  full_name: string;
  provider: string;
  provider_repo_id: string;
  status: string;
  created_at: Date;
}

export async function listRepositoriesByOrganization(
  orgId: string
): Promise<RepositoryRow[]> {
  const result = await getPool().query<RepositoryRow>(
    `select r.id, r.name, r.full_name, r.provider, r.provider_repo_id,
            r.status, r.created_at
       from public.repositories r
      where r.organization_id = $1
        and r.status = 'active'
      order by r.created_at desc`,
    [orgId]
  );
  return result.rows;
}

export interface InsertRepositoryInput {
  organizationId: string;
  provider: string;
  providerRepoId: string;
  name: string;
  fullName: string;
  ownerNamespace: string;
  defaultBranch: string;
  credentialToken: string;
  webhookSecret: string;
}

export interface InsertRepositoryResult {
  repositoryId: string;
  integrationId: string;
}

export interface RepositoryDetailRow {
  id: string;
  name: string;
  full_name: string;
  provider: string;
  default_branch: string;
  status: string;
  created_at: Date;
  webhook_secret: string;
  /** null = 尚未做过自动注册（老仓库或元数据缺失），fallback 当作 manual 显示 */
  webhook_mode: "auto" | "manual" | null;
  webhook_hook_id: string | null;
  webhook_last_error: { code: string; message: string } | null;
}

export async function getRepositoryById(
  id: string,
  organizationId: string
): Promise<RepositoryDetailRow | null> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<RepositoryDetailRow & { metadata: unknown }>(
      `select r.id, r.name, r.full_name, r.provider, r.default_branch,
              r.status, r.created_at,
              ri.metadata
         from public.repositories r
         join public.repo_integrations ri
           on ri.repository_id = r.id and ri.provider = r.provider
        where r.id = $1 and r.organization_id = $2
        limit 1`,
      [id, organizationId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    const meta = row.metadata as {
      webhook_secret?: string;
      webhook?: WebhookRegistrationMeta;
    } | null;
    const webhookMeta = meta?.webhook ?? null;

    return {
      id: row.id,
      name: row.name,
      full_name: row.full_name,
      provider: row.provider,
      default_branch: row.default_branch,
      status: row.status,
      created_at: row.created_at,
      webhook_secret: meta?.webhook_secret ?? "",
      webhook_mode: webhookMeta?.mode ?? null,
      webhook_hook_id: webhookMeta?.hook_id ?? null,
      webhook_last_error: webhookMeta?.last_error ?? null,
    };
  } catch (error) {
    logger.error("Failed to fetch repository by id", error as Error, {
      operation: "get_repository_by_id",
      repository_id: id,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to fetch repository"
    );
  }
}

export interface RepositoryWithCredential extends RepositoryDetailRow {
  credentialToken: string;
}

export async function getRepositoryWithCredential(
  id: string,
  organizationId: string
): Promise<RepositoryWithCredential | null> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<RepositoryDetailRow & { metadata: unknown }>(
      `select r.id, r.name, r.full_name, r.provider, r.default_branch,
              r.status, r.created_at,
              ri.metadata
         from public.repositories r
         join public.repo_integrations ri
           on ri.repository_id = r.id and ri.provider = r.provider
        where r.id = $1 and r.organization_id = $2
        limit 1`,
      [id, organizationId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    const meta = row.metadata as {
      webhook_secret?: string;
      credential?: { token?: string };
    } | null;

    const credentialToken = meta?.credential?.token;
    if (!credentialToken) return null;

    const webhookMeta = (meta as { webhook?: WebhookRegistrationMeta } | null)?.webhook ?? null;
    return {
      id: row.id,
      name: row.name,
      full_name: row.full_name,
      provider: row.provider,
      default_branch: row.default_branch,
      status: row.status,
      created_at: row.created_at,
      webhook_secret: meta?.webhook_secret ?? "",
      webhook_mode: webhookMeta?.mode ?? null,
      webhook_hook_id: webhookMeta?.hook_id ?? null,
      webhook_last_error: webhookMeta?.last_error ?? null,
      credentialToken,
    };
  } catch (error) {
    logger.error("Failed to fetch repository with credential", error as Error, {
      operation: "get_repository_with_credential",
      repository_id: id,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to fetch repository with credential"
    );
  }
}

export async function insertRepositoryWithIntegration(
  input: InsertRepositoryInput
): Promise<InsertRepositoryResult> {
  const logger = createLogger({ component: "queue" });
  const client: PoolClient = await getPool().connect();

  try {
    await client.query("BEGIN");

    // 1. Upsert repository
    let repositoryId: string;
    const repoInsert = await client.query<{ id: string }>(
      `insert into public.repositories
         (organization_id, provider, provider_repo_id, name, full_name,
          provider_owner_namespace, default_branch, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'active')
       on conflict (organization_id, provider, provider_repo_id) do nothing
       returning id`,
      [
        input.organizationId,
        input.provider,
        input.providerRepoId,
        input.name,
        input.fullName,
        input.ownerNamespace,
        input.defaultBranch,
      ]
    );

    if (repoInsert.rows[0]) {
      repositoryId = repoInsert.rows[0].id;
    } else {
      const existing = await client.query<{ id: string }>(
        `select id from public.repositories
          where organization_id = $1 and provider = $2 and provider_repo_id = $3`,
        [input.organizationId, input.provider, input.providerRepoId]
      );
      repositoryId = existing.rows[0]!.id;
    }

    // 2. Upsert repo_integration (MVP: store credential in metadata)
    const credentialType =
      input.provider === "gitee" ? "gitee_pat"
      : input.provider === "gitlab" ? "gitlab_pat"
      : "github_pat";
    const metadata = {
      credential: { type: credentialType, token: input.credentialToken },
      webhook_secret: input.webhookSecret,
    };

    let integrationId: string;
    const integrationInsert = await client.query<{ id: string }>(
      `insert into public.repo_integrations
         (organization_id, repository_id, provider, status, metadata)
       values ($1, $2, $3, 'active', $4)
       on conflict (repository_id, provider) do nothing
       returning id`,
      [input.organizationId, repositoryId, input.provider, JSON.stringify(metadata)]
    );

    if (integrationInsert.rows[0]) {
      integrationId = integrationInsert.rows[0].id;
    } else {
      const existing = await client.query<{ id: string }>(
        `select id from public.repo_integrations
          where repository_id = $1 and provider = $2`,
        [repositoryId, input.provider]
      );
      integrationId = existing.rows[0]!.id;
    }

    await client.query("COMMIT");

    logger.info("Repository integration created", {
      repository_id: repositoryId,
      integration_id: integrationId,
      organization_id: input.organizationId,
    });

    return { repositoryId, integrationId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface WebhookRegistrationMeta {
  hook_id: string | null;
  mode: "auto" | "manual";
  registered_at: string | null;
  last_error: { code: string; message: string } | null;
}

export interface RepoIntegrationWithCredential {
  integrationId: string;
  repositoryId: string;
  organizationId: string;
  provider: string;
  fullName: string;
  credentialToken: string;
  credentialType: string;
  webhookSecret: string;
  webhookMeta: WebhookRegistrationMeta | null;
}

/**
 * 读取 (repository, integration, credential) 三元组。给重试 / 删除 webhook 用。
 */
export async function getIntegrationByRepository(
  repositoryId: string,
  organizationId: string
): Promise<RepoIntegrationWithCredential | null> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      integration_id: string;
      repository_id: string;
      organization_id: string;
      provider: string;
      full_name: string;
      metadata: Record<string, unknown> | null;
    }>(
      `select
         ri.id as integration_id,
         ri.repository_id, ri.organization_id, ri.provider,
         r.full_name, ri.metadata
       from public.repo_integrations ri
       join public.repositories r on r.id = ri.repository_id
       where ri.repository_id = $1 and ri.organization_id = $2`,
      [repositoryId, organizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const meta = row.metadata ?? {};
    const credential = (meta as { credential?: { type?: string; token?: string } }).credential;
    return {
      integrationId: row.integration_id,
      repositoryId: row.repository_id,
      organizationId: row.organization_id,
      provider: row.provider,
      fullName: row.full_name,
      credentialToken: credential?.token ?? "",
      credentialType: credential?.type ?? "",
      webhookSecret: String((meta as { webhook_secret?: string }).webhook_secret ?? ""),
      webhookMeta:
        ((meta as { webhook?: WebhookRegistrationMeta }).webhook as WebhookRegistrationMeta) ??
        null,
    };
  } catch (error) {
    logger.error("Failed to load integration", error as Error, {
      operation: "get_integration_by_repository",
      repository_id: repositoryId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to load integration"
    );
  }
}

/**
 * 原子写 repo_integrations.metadata.webhook。其余 metadata 字段保留。
 */
export async function updateIntegrationWebhookMetadata(
  integrationId: string,
  webhook: WebhookRegistrationMeta
): Promise<void> {
  const logger = createLogger({ component: "queue" });
  try {
    await getPool().query(
      `update public.repo_integrations
          set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{webhook}', $2::jsonb, true),
              updated_at = now()
        where id = $1`,
      [integrationId, JSON.stringify(webhook)]
    );
    logger.info("Webhook metadata updated", {
      integration_id: integrationId,
      mode: webhook.mode,
      has_hook_id: webhook.hook_id != null,
    });
  } catch (error) {
    logger.error("Failed to update webhook metadata", error as Error, {
      operation: "update_integration_webhook_metadata",
      integration_id: integrationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to update webhook metadata"
    );
  }
}

export async function disableRepository(
  id: string,
  organizationId: string
): Promise<boolean> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{ id: string }>(
      `update public.repositories
          set status = 'disabled', updated_at = now()
        where id = $1 and organization_id = $2 and status = 'active'
        returning id`,
      [id, organizationId]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error("Failed to disable repository", error as Error, {
      operation: "disable_repository",
      repository_id: id,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to disable repository"
    );
  }
}

export interface RepositoryHealthRow {
  id: string;
  name: string;
  status: string;
  openFindings: number;
  lastReviewAt: Date | null;
}

export async function getRepositoryHealthItems(
  organizationId: string
): Promise<RepositoryHealthRow[]> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<{
      id: string;
      name: string;
      status: string;
      open_findings: string;
      last_review_at: Date | null;
    }>(
      `select
         r.id, r.name, r.status,
         coalesce(
           (select count(*)::bigint
              from public.review_issues ri
             where ri.repository_id = r.id
               and ri.organization_id = r.organization_id
               and ri.status not in ('resolved', 'ignored')),
           0
         ) as open_findings,
         (select rr.created_at
            from public.review_runs rr
           where rr.repository_id = r.id
             and rr.organization_id = r.organization_id
           order by rr.created_at desc
           limit 1) as last_review_at
       from public.repositories r
       where r.organization_id = $1
         and r.status = 'active'
       order by open_findings desc, r.name asc`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      openFindings: Number(row.open_findings),
      lastReviewAt: row.last_review_at,
    }));
  } catch (error) {
    logger.error("Failed to fetch repository health items", error as Error, {
      operation: "get_repository_health_items",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to fetch repository health items"
    );
  }
}
