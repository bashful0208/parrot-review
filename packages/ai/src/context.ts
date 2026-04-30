import fs from "node:fs/promises";
import path from "node:path";
import type { ProviderCredential } from "@reviewer/git";

export const REVIEWER_DOC_WHITELIST = [
  "CLAUDE.md",
  "AGENTS.md",
  "pattern.md",
  "README.md",
] as const;

export const MAX_DOC_CHARS = 4000;

const TRUNCATE_MARKER = "\n\n[...truncated]";

function truncate(text: string): string {
  if (text.length <= MAX_DOC_CHARS) return text;
  return text.slice(0, MAX_DOC_CHARS) + TRUNCATE_MARKER;
}

function joinDocs(parts: Array<{ name: string; content: string }>): string {
  if (parts.length === 0) return "";
  return parts.map((p) => `# ${p.name}\n${p.content}`).join("\n\n");
}

export class LruCache<V> {
  private readonly capacity: number;
  private readonly map = new Map<string, V>();

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`LruCache capacity must be a positive integer, got: ${capacity}`);
    }
    this.capacity = capacity;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (typeof oldestKey === "string") this.map.delete(oldestKey);
    }
  }
}

let reviewerCache: Promise<string> | null = null;

export async function loadReviewerGuidelines(): Promise<string> {
  if (reviewerCache) return reviewerCache;
  reviewerCache = (async () => {
    const cwd = process.cwd();
    const parts: Array<{ name: string; content: string }> = [];
    for (const name of REVIEWER_DOC_WHITELIST) {
      try {
        const raw = await fs.readFile(path.join(cwd, name), "utf-8");
        parts.push({ name, content: truncate(raw) });
      } catch {
        // 文件不存在或读不到，跳过
      }
    }
    return joinDocs(parts);
  })();
  return reviewerCache;
}

/** 仅供测试使用，正常代码路径不应调用。 */
export function _resetReviewerGuidelinesCache(): void {
  reviewerCache = null;
}

export const TARGET_CACHE_CAPACITY = 256;

const targetCacheRef: { cache: LruCache<string | null> } = {
  cache: new LruCache<string | null>(TARGET_CACHE_CAPACITY),
};

/** 最小日志接口，与 @reviewer/core Logger 结构兼容。 */
interface MinLogger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

interface TargetRepoProvider {
  provider: string;
  getRepositoryFile(
    fullName: string,
    path: string,
    ref: string,
    credential: ProviderCredential,
    logger?: MinLogger
  ): Promise<string | null>;
}

export async function loadTargetRepoContext(
  provider: TargetRepoProvider,
  fullName: string,
  ref: string,
  credential: ProviderCredential,
  logger: MinLogger
): Promise<string> {
  const cache = targetCacheRef.cache;
  const tasks = REVIEWER_DOC_WHITELIST.map(async (name) => {
    const cacheKey = `${provider.provider}:${fullName}:${ref}:${name}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      // cached 已通过 has() 确认存在，undefined 不可能发生；null 表示"文件不存在"负缓存
      if (cached === null || cached === undefined) return null;
      return { name: name as string, content: truncate(cached) };
    }
    try {
      const content = await provider.getRepositoryFile(
        fullName,
        name,
        ref,
        credential,
        logger
      );
      cache.set(cacheKey, content);
      return content === null ? null : { name: name as string, content: truncate(content) };
    } catch (err) {
      logger.warn("Failed to load project context file (will skip)", {
        full_name: fullName,
        ref,
        path: name,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  });

  const results = await Promise.all(tasks);
  const parts = results.filter(
    (r): r is { name: string; content: string } => r !== null
  );
  return joinDocs(parts);
}

/** 仅供测试使用。 */
export function _resetTargetRepoCache(): void {
  targetCacheRef.cache = new LruCache<string | null>(TARGET_CACHE_CAPACITY);
}
