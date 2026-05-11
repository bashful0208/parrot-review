import type { FileDiff } from "@reviewer/git";

const EMPTY_CATCH_RE = /catch\s*\([^)]*\)\s*\{\s*\}/g;

const BROAD_CATCH_RES = [
  /catch\s*\(\s*Exception\s+/g,
  /catch\s*\(\s*Throwable\s+/g,
  /catch\s*\(\s*\.\.\.\s*\)/g,
  /catch\s*\(\s*_\s*\)/g,
  /catch\s*\(\s*\w+\s*:\s*any\s*\)/g,
  /catch\s*\(\s*\w+\s*\)\s*(?![^{]*\bif\b)(?![^{]*\binstanceof\b)/g,
];

const DOWNGRADED_LOG_RE = /logger\.(?:warn|info|debug)\(/g;
const CONSOLE_LOG_RE = /console\.(?:log|warn|info|debug)\(/g;

const GENERIC_MSG_RES = [
  /throw new \w+\(\s*["'`]something went wrong["'`]/gi,
  /throw new \w+\(\s*["'`]an error occurred["'`]/gi,
  /throw new \w+\(\s*["'`]error["'`]\s*\)/gi,
  /throw new \w+\(\s*["'`]unknown error["'`]/gi,
  /throw new \w+\(\s*["'`]unexpected error["'`]/gi,
];

export interface ScannedErrorPattern {
  filePath: string;
  startLine: number;
  endLine: number;
  pattern:
    | "empty_catch"
    | "broad_catch"
    | "downgraded_logging"
    | "non_actionable_message";
  context: string;
}

/** Extract surrounding context from added-lines view around the given offset. */
function extractAddLinesContext(
  addLines: string,
  offset: number
): string {
  const before = addLines.slice(0, offset);
  const lineNum = (before.match(/\n/g) || []).length + 1;
  const lines = addLines.split("\n");
  const start = Math.max(0, lineNum - 2);
  const end = Math.min(lines.length, lineNum + 2);
  return lines.slice(start, end).join("\n").trim();
}

/**
 * Scan FileDiff patches for mechanical error-handling anti-patterns.
 * Pure deterministic detection — no LLM. The results are fed into the
 * error_handler LLM reviewer as structured context so it can filter false
 * positives and add semantic analysis.
 */
export function scanErrorHandlingPatterns(
  diffs: FileDiff[]
): ScannedErrorPattern[] {
  const results: ScannedErrorPattern[] = [];

  for (const diff of diffs) {
    if (!diff.patch || diff.isBinary) continue;

    const addLines = extractAddedLines(diff.patch);
    if (addLines.length === 0) continue;

    // 1. Empty catch blocks
    for (const match of addLines.matchAll(EMPTY_CATCH_RE)) {
      results.push({
        filePath: diff.filePath,
        startLine: estimateLineInFile(diff.patch, match.index ?? 0),
        endLine:
          estimateLineInFile(
            diff.patch,
            (match.index ?? 0) + match[0].length,
          ) + 1,
        pattern: "empty_catch",
        context: match[0].trim(),
      });
    }

    // 2. Broad catch patterns
    for (const re of BROAD_CATCH_RES) {
      for (const match of addLines.matchAll(re)) {
        const ctx = extractAddLinesContext(addLines, match.index ?? 0);
        // Skip if there's a type-narrowing or re-throw on the next line
        if (/(?:if\s*\(|instanceof|throw\s+\w)/.test(ctx)) continue;

        results.push({
          filePath: diff.filePath,
          startLine: estimateLineInFile(diff.patch, match.index ?? 0),
          endLine:
            estimateLineInFile(
              diff.patch,
              (match.index ?? 0) + match[0].length,
            ) + 1,
          pattern: "broad_catch",
          context: ctx,
        });
      }
    }

    // 3. Downgraded logging inside catch blocks
    for (const match of addLines.matchAll(DOWNGRADED_LOG_RE)) {
      if (isInsideCatchBlock(addLines, match.index ?? 0)) {
        results.push({
          filePath: diff.filePath,
          startLine: estimateLineInFile(diff.patch, match.index ?? 0),
          endLine:
            estimateLineInFile(
              diff.patch,
              (match.index ?? 0) + match[0].length,
            ) + 1,
          pattern: "downgraded_logging",
          context: extractAddLinesContext(addLines, match.index ?? 0),
        });
      }
    }

    // console.* inside catch blocks
    for (const match of addLines.matchAll(CONSOLE_LOG_RE)) {
      if (isInsideCatchBlock(addLines, match.index ?? 0)) {
        results.push({
          filePath: diff.filePath,
          startLine: estimateLineInFile(diff.patch, match.index ?? 0),
          endLine:
            estimateLineInFile(
              diff.patch,
              (match.index ?? 0) + match[0].length,
            ) + 1,
          pattern: "downgraded_logging",
          context: extractAddLinesContext(addLines, match.index ?? 0),
        });
      }
    }

    // 4. Non-actionable error messages in throw statements
    for (const re of GENERIC_MSG_RES) {
      for (const match of addLines.matchAll(re)) {
        results.push({
          filePath: diff.filePath,
          startLine: estimateLineInFile(diff.patch, match.index ?? 0),
          endLine:
            estimateLineInFile(
              diff.patch,
              (match.index ?? 0) + match[0].length,
            ) + 1,
          pattern: "non_actionable_message",
          context: match[0].trim(),
        });
      }
    }
  }

  return results;
}

/**
 * Format scanned patterns as an XML block for injection into the LLM prompt.
 */
export function formatScannedPatternsForPrompt(
  patterns: ScannedErrorPattern[]
): string {
  if (patterns.length === 0) return "";

  const items = patterns
    .map(
      (p, i) =>
        `${i + 1}. [${p.pattern}] ${p.filePath}:${p.startLine}-${p.endLine}\n   Code: ${p.context}`
    )
    .join("\n\n");

  return `<pre_scanned_error_patterns>
The following mechanical error-handling patterns were detected in the diff.
For each, determine whether it represents a real problem or is intentional:

${items}
</pre_scanned_error_patterns>
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract only the added lines (lines starting with "+" but not "+++")
 * from a unified diff patch for easier pattern matching on new code.
 */
function extractAddedLines(patch: string): string {
  const lines = patch.split("\n");
  const added: string[] = [];
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added.push(line.slice(1));
    }
  }
  return added.join("\n");
}

/**
 * Given an offset into the added-lines view of a patch, estimate the
 * corresponding position in the full patch. Coarse but sufficient for
 * scanner line references.
 */
function estimateLineInFile(
  patch: string,
  addedLinesOffset: number
): number {
  // Walk through the patch and find the hunk header to get the starting line
  const hunkMatch = patch.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/m);
  const hunkStartLine = hunkMatch ? parseInt(hunkMatch[1], 10) : 1;

  // Count new-file lines up to the offset in the added-lines view
  const addedLines = extractAddedLines(patch);
  const before = addedLines.slice(0, addedLinesOffset);
  const lineCount = (before.match(/\n/g) || []).length;

  return hunkStartLine + lineCount;
}

/**
 * Check whether a position in the added-lines view falls inside a catch block.
 * Looks backwards from the position for the nearest `catch` vs `try` keyword.
 */
function isInsideCatchBlock(addedLines: string, pos: number): boolean {
  const before = addedLines.slice(0, pos);
  const lastCatch = before.lastIndexOf("catch");
  const lastTry = before.lastIndexOf("try {");
  return lastCatch > lastTry;
}
