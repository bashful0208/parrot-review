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

export interface ActiveAiProviderResult {
  primary: AiProviderConfigWithKey;
  fallbacks: AiProviderConfigWithKey[];
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
    id: String(row["id"] ?? ""),
    organizationId: String(row["organization_id"] ?? ""),
    provider: row["provider"] as AiProviderType,
    displayName: String(row["display_name"] ?? ""),
    model: row["model"] != null ? String(row["model"]) : "",
    baseUrl: row["base_url"] != null ? String(row["base_url"]) : null,
    maskedKeySuffix: row["masked_key_suffix"] != null ? String(row["masked_key_suffix"]) : null,
    isActive: row["is_active"] === true,
    createdAt: row["created_at"] instanceof Date ? row["created_at"] : new Date(String(row["created_at"])),
  };
}

function mapRowWithKey(row: Record<string, unknown>): AiProviderConfigWithKey {
  return {
    ...mapRow(row),
    apiKey: String(row["api_key"] ?? ""),
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
  organizationId: string
): Promise<ActiveAiProviderResult | null> {
  const logger = createLogger({ component: "queue" });
  try {
    // 获取主 provider（is_fallback = false）
    const primaryResult = await getPool().query<Record<string, unknown>>(
      `select id, organization_id, provider, display_name,
              base_url, masked_key_suffix, is_active, created_at,
              metadata->>'model' as model,
              metadata->>'api_key' as api_key
         from public.ai_provider_configs
        where organization_id = $1
          and is_active = true
          and is_fallback = false
        order by created_at desc
        limit 1`,
      [organizationId]
    );

    if (primaryResult.rows.length === 0) return null;
    const primary = mapRowWithKey(primaryResult.rows[0]!);
    if (!primary.apiKey) {
      throw new AppError(
        ErrorCode.DependencyDatabaseConnection,
        "Active AI provider config has no API key stored"
      );
    }

    // 获取 fallback providers（is_fallback = true）
    const fallbackResult = await getPool().query<Record<string, unknown>>(
      `select id, organization_id, provider, display_name,
              base_url, masked_key_suffix, is_active, created_at,
              metadata->>'model' as model,
              metadata->>'api_key' as api_key
         from public.ai_provider_configs
        where organization_id = $1
          and is_active = true
          and is_fallback = true
        order by created_at asc`,
      [organizationId]
    );
    const fallbacks = fallbackResult.rows.map(mapRowWithKey);

    return { primary, fallbacks };
  } catch (error) {
    logger.error("Failed to get active AI provider config", error as Error, {
      operation: "get_active_ai_provider_config",
      organization_id: organizationId,
    });
    throw new AppError(
      ErrorCode.DependencyDatabaseConnection,
      "Failed to get active AI provider config"
    );
  }
}

/** @deprecated Use getActiveAiProviderConfig which returns primary + fallbacks */
export async function getActiveAiProviderConfigLegacy(
  organizationId: string
): Promise<AiProviderConfigWithKey | null> {
  const result = await getActiveAiProviderConfig(organizationId);
  return result?.primary ?? null;
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
      throw new Error("Cannot delete active provider config. Deactivate it first.");
    }

    await getPool().query(
      `delete from public.ai_provider_configs where id = $1 and organization_id = $2 and is_active = false`,
      [id, orgId]
    );

    logger.info("AI provider config deleted", {
      config_id: id,
      organization_id: orgId,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cannot delete")) {
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
