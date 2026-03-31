export class ConfigValidationError extends Error {
  readonly missingKeys: string[];
  readonly invalidKeys: string[];

  constructor(missingKeys: string[], invalidKeys: string[] = []) {
    super("Invalid environment configuration");
    this.name = "ConfigValidationError";
    this.missingKeys = missingKeys;
    this.invalidKeys = invalidKeys;
  }
}

export function formatConfigError(error: unknown): string {
  if (!(error instanceof ConfigValidationError)) {
    return error instanceof Error ? error.message : "Unknown config error";
  }

  const lines = ["Environment configuration is invalid."];

  if (error.missingKeys.length > 0) {
    lines.push(`Missing: ${error.missingKeys.join(", ")}`);
  }

  if (error.invalidKeys.length > 0) {
    lines.push(`Invalid: ${error.invalidKeys.join(", ")}`);
  }

  lines.push("Check .env.example and deployment variable docs.");

  return lines.join("\n");
}
