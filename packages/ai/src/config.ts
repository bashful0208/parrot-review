export const SUPPORTED_MODEL_PROVIDERS = [
  "anthropic",
  "openai",
  "openrouter",
] as const;

export type SupportedModelProvider =
  (typeof SUPPORTED_MODEL_PROVIDERS)[number];

export type AiProviderConfig = {
  provider: SupportedModelProvider;
  model: string;
};

type EnvLike = Record<string, string | undefined>;

function readEnv(): EnvLike {
  return (globalThis as { process?: { env?: EnvLike } }).process?.env ?? {};
}

function requireEnv(value: string | undefined, key: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`[ai] Missing required environment variable: ${key}`);
  }

  return value.trim();
}

function parseProvider(value: string): SupportedModelProvider {
  if (
    SUPPORTED_MODEL_PROVIDERS.includes(value as SupportedModelProvider)
  ) {
    return value as SupportedModelProvider;
  }

  throw new Error(
    `[ai] Unsupported DEFAULT_MODEL_PROVIDER: ${value}`
  );
}

export function loadAiProviderConfig(env: EnvLike = readEnv()): AiProviderConfig {
  return {
    provider: parseProvider(
      requireEnv(env.DEFAULT_MODEL_PROVIDER, "DEFAULT_MODEL_PROVIDER")
    ),
    model: requireEnv(env.DEFAULT_MODEL_NAME, "DEFAULT_MODEL_NAME"),
  };
}
