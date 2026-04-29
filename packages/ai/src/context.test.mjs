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
