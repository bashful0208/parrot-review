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

export type AiProviderType = "anthropic" | "openai" | "alibaba" | "custom";

export interface CreateAiProviderConfigInput {
  organizationId: string;
  provider: AiProviderType;
  displayName: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  createdByUserId?: string;
}

export interface AiProviderConfigRow {
  id: string;
  organizationId: string;
  provider: AiProviderType;
  displayName: string;
  model: string;
  baseUrl: string | null;
  maskedKeySuffix: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface AiProviderConfigWithKey extends AiProviderConfigRow {
  apiKey: string;
}

export async function createAiProviderConfig(
  input: CreateAiProviderConfigInput
): Promise<{ id: string }> {
  const logger = createLogger({ component: "queue" });
  try {
    const maskedKeySuffix = input.apiKey.slice(-4);
    const metadata = JSON.stringify({
      api_key: input.apiKey,
      model: input.model,
    });

    const result = await getPool().query<{ id: string }>(
      `insert into public.ai_provider_configs
         (organization_id, provider, display_name, base_url, masked_key_suffix, metadata, is_active)
       values ($1, $2, $3, $4, $5, $6, false)
       returning id`,
      [
        input.organizationId,
        input.provider,
        input.displayName,
        input.baseUrl ?? null,
        maskedKeySuffix,
        metadata,
      ]
    );

    const row = result.rows[0]!;
    logger.info("AI provider config created", {
      config_id: row.id,
      organization_id: input.organizationId,
      provider: input.provider,
    });

    return { id: row.id };
  } catch (error) {
    logger.error("Failed to create AI provider config", error as Error, {
      operation: "create_ai_provider_config",
      organization_id: input.organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to create AI provider config"
    );
  }
}

function mapRow(row: Record<string, unknown>): AiProviderConfigRow {
  return {
    id: row["id"] as string,
    organizationId: row["organization_id"] as string,
    provider: row["provider"] as AiProviderType,
    displayName: row["display_name"] as string,
    model: (row["model"] as string | null) ?? "",
    baseUrl: (row["base_url"] as string | null) ?? null,
    maskedKeySuffix: (row["masked_key_suffix"] as string | null) ?? null,
    isActive: row["is_active"] as boolean,
    createdAt: row["created_at"] as Date,
  };
}

export async function listAiProviderConfigs(
  orgId: string
): Promise<AiProviderConfigRow[]> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<Record<string, unknown>>(
      `select id, organization_id, provider, display_name,
              base_url, masked_key_suffix, is_active, created_at,
              metadata->>'model' as model
         from public.ai_provider_configs
        where organization_id = $1
        order by created_at desc`,
      [orgId]
    );

    return result.rows.map(mapRow);
  } catch (error) {
    logger.error("Failed to list AI provider configs", error as Error, {
      operation: "list_ai_provider_configs",
      organization_id: orgId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to list AI provider configs"
    );
  }
}

export async function getActiveAiProviderConfig(
  orgId: string
): Promise<AiProviderConfigWithKey | null> {
  const logger = createLogger({ component: "queue" });
  try {
    const result = await getPool().query<Record<string, unknown>>(
      `select id, organization_id, provider, display_name,
              base_url, masked_key_suffix, is_active, created_at,
              metadata->>'model' as model,
              metadata->>'api_key' as api_key
         from public.ai_provider_configs
        where organization_id = $1 and is_active = true
        limit 1`,
      [orgId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0]!;
    return {
      ...mapRow(row),
      apiKey: (row["api_key"] as string | null) ?? "",
    };
  } catch (error) {
    logger.error("Failed to get active AI provider config", error as Error, {
      operation: "get_active_ai_provider_config",
      organization_id: orgId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to get active AI provider config"
    );
  }
}

export async function setActiveAiProviderConfig(
  orgId: string,
  configId: string
): Promise<void> {
  const logger = createLogger({ component: "queue" });
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `update public.ai_provider_configs
          set is_active = false, updated_at = now()
        where organization_id = $1`,
      [orgId]
    );
    await client.query(
      `update public.ai_provider_configs
          set is_active = true, updated_at = now()
        where id = $2 and organization_id = $1`,
      [orgId, configId]
    );
    await client.query("COMMIT");

    logger.info("AI provider config activated", {
      config_id: configId,
      organization_id: orgId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to set active AI provider config", error as Error, {
      operation: "set_active_ai_provider_config",
      organization_id: orgId,
      config_id: configId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to set active AI provider config"
    );
  } finally {
    client.release();
  }
}

export async function deleteAiProviderConfig(
  id: string,
  orgId: string
): Promise<void> {
  const logger = createLogger({ component: "queue" });
  try {
    const checkResult = await getPool().query<{ is_active: boolean }>(
      `select is_active from public.ai_provider_configs where id = $1 and organization_id = $2`,
      [id, orgId]
    );

    if (checkResult.rows.length === 0) {
      return;
    }

    if (checkResult.rows[0]!.is_active) {
      throw new Error("Cannot delete active provider config");
    }

    await getPool().query(
      `delete from public.ai_provider_configs where id = $1 and organization_id = $2`,
      [id, orgId]
    );

    logger.info("AI provider config deleted", {
      config_id: id,
      organization_id: orgId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Cannot delete active provider config") {
      throw error;
    }
    logger.error("Failed to delete AI provider config", error as Error, {
      operation: "delete_ai_provider_config",
      config_id: id,
      organization_id: orgId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to delete AI provider config"
    );
  }
}
