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
    const metadata = {
      credential: { type: "github_pat", token: input.credentialToken },
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
