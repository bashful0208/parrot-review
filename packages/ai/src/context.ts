import fs from "node:fs/promises";
import path from "node:path";

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
