export type AiErrorCode =
  | "rate_limit"
  | "auth"
  | "quota"
  | "timeout"
  | "network"
  | "bad_request"
  | "server_error"
  | "truncated"
  | "parse_error"
  | "validation_error"
  | "unknown";

interface ErrLike {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
}

function asErrLike(e: unknown): ErrLike {
  if (e === null || typeof e !== "object") return {};
  const o = e as Record<string, unknown>;
  return {
    status: typeof o.status === "number" ? o.status : undefined,
    code: typeof o.code === "string" ? o.code : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
    message: typeof o.message === "string" ? o.message : undefined,
  };
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
]);

export function classifyAiError(err: unknown): AiErrorCode {
  const e = asErrLike(err);

  // 1) HTTP status takes precedence (most reliable signal from SDKs)
  if (typeof e.status === "number") {
    const s = e.status;
    if (s === 429) return "rate_limit";
    if (s === 401 || s === 403) return "auth";
    if (s === 402) return "quota";
    if (s === 400) return "bad_request";
    if (s >= 500 && s < 600) return "server_error";
  }

  // 2) Network-layer error codes
  if (e.code && NETWORK_CODES.has(e.code)) return "network";
  if (e.code === "ETIMEDOUT" || e.name === "TimeoutError") return "timeout";

  // 3) JSON parse failures from Node's built-in parser
  if (e.name === "SyntaxError" && (e.message ?? "").toLowerCase().includes("json")) {
    return "parse_error";
  }

  // 4) Message-based heuristics (last resort)
  const msg = (e.message ?? "").toLowerCase();
  if (msg === "") return "unknown";

  if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("etimedout"))
    return "timeout";
  if (msg.includes("rate limit") || msg.includes("rate-limit") || msg.includes("rate_limit"))
    return "rate_limit";

  // JSON parse failures from our own parsing
  if (msg.includes("failed to parse")) return "parse_error";

  // Our own validation throws use these phrasings — see adapter.ts validators.
  if (
    msg.includes("must be an array") ||
    msg.includes("must be a non-empty string") ||
    msg.includes("did not return expected") ||
    msg.includes("expected a") ||
    msg.includes("required")
  ) {
    return "validation_error";
  }

  return "unknown";
}
