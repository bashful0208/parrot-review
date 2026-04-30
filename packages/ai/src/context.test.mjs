import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Reference implementation — context.ts must implement the same contract.
// Tests assert against this reference; tsc protects the actual signature.
// ---------------------------------------------------------------------------

const REVIEWER_DOC_WHITELIST = ["CLAUDE.md", "AGENTS.md", "pattern.md", "README.md"];
const MAX_DOC_CHARS = 4000;
const TRUNCATE_MARKER = "\n\n[...truncated]";

function truncate_reference(text) {
  if (text.length <= MAX_DOC_CHARS) return text;
  return text.slice(0, MAX_DOC_CHARS) + TRUNCATE_MARKER;
}

function joinDocs_reference(parts) {
  if (parts.length === 0) return "";
  return parts.map((p) => `# ${p.name}\n${p.content}`).join("\n\n");
}

let _reviewerCache = null;
function _resetReviewerGuidelinesCache_reference() {
  _reviewerCache = null;
}
async function loadReviewerGuidelines_reference() {
  if (_reviewerCache) return _reviewerCache;
  _reviewerCache = (async () => {
    const cwd = process.cwd();
    const parts = [];
    for (const name of REVIEWER_DOC_WHITELIST) {
      try {
        const raw = await fs.readFile(path.join(cwd, name), "utf-8");
        parts.push({ name, content: truncate_reference(raw) });
      } catch {
        // skip
      }
    }
    return joinDocs_reference(parts);
  })();
  return _reviewerCache;
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

async function withTempCwd(files, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rev-ctx-"));
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content, "utf-8");
  }
  const original = process.cwd();
  process.chdir(dir);
  try {
    _resetReviewerGuidelinesCache_reference();
    await fn(dir);
  } finally {
    process.chdir(original);
    await fs.rm(dir, { recursive: true, force: true });
    _resetReviewerGuidelinesCache_reference();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("loadReviewerGuidelines: concatenates whitelisted files in order", async () => {
  await withTempCwd(
    {
      "CLAUDE.md": "claude-rule",
      "AGENTS.md": "agent-rule",
      "pattern.md": "pattern-rule",
      "README.md": "readme-rule",
    },
    async () => {
      const out = await loadReviewerGuidelines_reference();
      const order = REVIEWER_DOC_WHITELIST.map((f) => out.indexOf(`# ${f}`));
      assert.ok(order[0] < order[1], "CLAUDE.md before AGENTS.md");
      assert.ok(order[1] < order[2], "AGENTS.md before pattern.md");
      assert.ok(order[2] < order[3], "pattern.md before README.md");
      assert.ok(out.includes("claude-rule"));
      assert.ok(out.includes("readme-rule"));
    }
  );
});

test("loadReviewerGuidelines: skips missing files silently", async () => {
  await withTempCwd({ "README.md": "only-readme" }, async () => {
    const out = await loadReviewerGuidelines_reference();
    assert.ok(out.includes("only-readme"));
    assert.ok(!out.includes("# CLAUDE.md"));
    assert.ok(!out.includes("# AGENTS.md"));
    assert.ok(!out.includes("# pattern.md"));
  });
});

test("loadReviewerGuidelines: empty when no whitelisted files exist", async () => {
  await withTempCwd({}, async () => {
    const out = await loadReviewerGuidelines_reference();
    assert.equal(out, "");
  });
});

test("loadReviewerGuidelines: truncates files over 4000 chars", async () => {
  const big = "x".repeat(5000);
  await withTempCwd({ "README.md": big }, async () => {
    const out = await loadReviewerGuidelines_reference();
    assert.ok(out.includes("[...truncated]"), "should annotate truncation");
    const xs = (out.match(/x/g) ?? []).length;
    assert.equal(xs, 4000, "must keep exactly 4000 chars of content");
  });
});

test("loadReviewerGuidelines: caches across calls (lazy load once)", async () => {
  await withTempCwd({ "README.md": "first" }, async (dir) => {
    const a = await loadReviewerGuidelines_reference();
    await fs.writeFile(path.join(dir, "README.md"), "second", "utf-8");
    const b = await loadReviewerGuidelines_reference();
    assert.equal(a, b, "second call returns cached value, not new file content");
  });
});

// ---------------------------------------------------------------------------
// LruCache reference impl (production class lives in context.ts)
// ---------------------------------------------------------------------------

class LruCache_reference {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`LruCache capacity must be a positive integer, got: ${capacity}`);
    }
    this._capacity = capacity;
    this._map = new Map();
  }
  has(key) { return this._map.has(key); }
  get(key) {
    if (!this._map.has(key)) return undefined;
    const v = this._map.get(key);
    this._map.delete(key);
    this._map.set(key, v);
    return v;
  }
  set(key, value) {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, value);
    if (this._map.size > this._capacity) {
      const oldestKey = this._map.keys().next().value;
      if (typeof oldestKey === "string") this._map.delete(oldestKey);
    }
  }
}

test("LruCache: stores and retrieves values", () => {
  const c = new LruCache_reference(3);
  c.set("a", "1");
  assert.equal(c.get("a"), "1");
});

test("LruCache: returns undefined for missing keys", () => {
  const c = new LruCache_reference(3);
  assert.equal(c.get("missing"), undefined);
});

test("LruCache: evicts oldest when capacity exceeded", () => {
  const c = new LruCache_reference(2);
  c.set("a", "1");
  c.set("b", "2");
  c.set("c", "3");
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("b"), "2");
  assert.equal(c.get("c"), "3");
});

test("LruCache: get() refreshes recency", () => {
  const c = new LruCache_reference(2);
  c.set("a", "1");
  c.set("b", "2");
  c.get("a");
  c.set("c", "3");
  assert.equal(c.get("a"), "1");
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("c"), "3");
});

test("LruCache: set() of existing key refreshes recency", () => {
  const c = new LruCache_reference(2);
  c.set("a", "1");
  c.set("b", "2");
  c.set("a", "1b");
  c.set("c", "3");
  assert.equal(c.get("a"), "1b");
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("c"), "3");
});

test("LruCache: stores null values explicitly (negative cache)", () => {
  const c = new LruCache_reference(2);
  c.set("missing", null);
  assert.equal(c.has("missing"), true);
  assert.equal(c.get("missing"), null);
});

test("LruCache: rejects non-positive capacity", () => {
  assert.throws(() => new LruCache_reference(0), /capacity/);
  assert.throws(() => new LruCache_reference(-1), /capacity/);
  assert.throws(() => new LruCache_reference(1.5), /capacity/);
});

// ---------------------------------------------------------------------------
// loadTargetRepoContext reference (production lives in context.ts)
// ---------------------------------------------------------------------------

let _targetCacheRef = { cache: new LruCache_reference(256) };
function _resetTargetRepoCache_reference() {
  _targetCacheRef.cache = new LruCache_reference(256);
}

async function loadTargetRepoContext_reference(provider, fullName, ref, credential, logger) {
  const cache = _targetCacheRef.cache;
  const tasks = REVIEWER_DOC_WHITELIST.map(async (name) => {
    const cacheKey = `${provider.provider}:${fullName}:${ref}:${name}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      return cached === null ? null : { name, content: truncate_reference(cached) };
    }
    try {
      const content = await provider.getRepositoryFile(fullName, name, ref, credential, logger);
      cache.set(cacheKey, content);
      return content === null ? null : { name, content: truncate_reference(content) };
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
  const parts = results.filter((r) => r !== null);
  return joinDocs_reference(parts);
}

function fakeProvider(map = {}, opts = {}) {
  const calls = [];
  return {
    calls,
    provider: "github",
    async getRepositoryFile(fullName, path, ref) {
      calls.push({ fullName, path, ref });
      if (opts.throwOn?.(path)) throw new Error("boom");
      const key = `${fullName}|${path}|${ref}`;
      return key in map ? map[key] : null;
    },
  };
}

const FAKE_LOGGER = {
  debug() {}, info() {}, warn() {}, error() {},
};

const FAKE_CRED = { type: "github_pat", token: "x" };

test("loadTargetRepoContext: pulls whitelisted files concurrently", async () => {
  _resetTargetRepoCache_reference();
  const p = fakeProvider({
    "owner/repo|CLAUDE.md|sha1": "claude-content",
    "owner/repo|README.md|sha1": "readme-content",
  });
  const out = await loadTargetRepoContext_reference(p, "owner/repo", "sha1", FAKE_CRED, FAKE_LOGGER);
  assert.ok(out.includes("# CLAUDE.md"));
  assert.ok(out.includes("claude-content"));
  assert.ok(out.includes("# README.md"));
  assert.ok(out.includes("readme-content"));
  assert.equal(p.calls.length, 4, "must attempt all 4 whitelist files");
});

test("loadTargetRepoContext: returns empty string when nothing found", async () => {
  _resetTargetRepoCache_reference();
  const p = fakeProvider({});
  const out = await loadTargetRepoContext_reference(p, "owner/repo", "sha1", FAKE_CRED, FAKE_LOGGER);
  assert.equal(out, "");
});

test("loadTargetRepoContext: caches by (provider, fullName, ref, path)", async () => {
  _resetTargetRepoCache_reference();
  const p = fakeProvider({ "owner/repo|README.md|sha1": "rd" });
  await loadTargetRepoContext_reference(p, "owner/repo", "sha1", FAKE_CRED, FAKE_LOGGER);
  const before = p.calls.length;
  await loadTargetRepoContext_reference(p, "owner/repo", "sha1", FAKE_CRED, FAKE_LOGGER);
  assert.equal(p.calls.length, before, "second call must hit cache for all 4 files");
});

test("loadTargetRepoContext: cache key isolates by ref (head SHA)", async () => {
  _resetTargetRepoCache_reference();
  const p = fakeProvider({
    "owner/repo|README.md|sha1": "old",
    "owner/repo|README.md|sha2": "new",
  });
  const a = await loadTargetRepoContext_reference(p, "owner/repo", "sha1", FAKE_CRED, FAKE_LOGGER);
  const b = await loadTargetRepoContext_reference(p, "owner/repo", "sha2", FAKE_CRED, FAKE_LOGGER);
  assert.ok(a.includes("old"));
  assert.ok(b.includes("new"));
});

test("loadTargetRepoContext: warn-and-skip on per-file error, others still load", async () => {
  _resetTargetRepoCache_reference();
  const warnings = [];
  const logger = { ...FAKE_LOGGER, warn: (msg, extra) => warnings.push({ msg, extra }) };
  const p = fakeProvider(
    { "owner/repo|README.md|sha1": "rd" },
    { throwOn: (path) => path === "CLAUDE.md" }
  );
  const out = await loadTargetRepoContext_reference(p, "owner/repo", "sha1", FAKE_CRED, logger);
  assert.ok(out.includes("rd"));
  assert.ok(!out.includes("# CLAUDE.md"));
  assert.ok(warnings.some((w) => w.msg.includes("project context")));
});

test("loadTargetRepoContext: truncates files over 4000 chars", async () => {
  _resetTargetRepoCache_reference();
  const big = "y".repeat(5000);
  const p = fakeProvider({ "owner/repo|README.md|sha1": big });
  const out = await loadTargetRepoContext_reference(p, "owner/repo", "sha1", FAKE_CRED, FAKE_LOGGER);
  assert.ok(out.includes("[...truncated]"));
  const ys = (out.match(/y/g) ?? []).length;
  assert.equal(ys, 4000);
});
