import type { FileDiff } from "@reviewer/git";
import type { ReviewFocus } from "../types.js";

const NON_CODE_EXTENSIONS = new Set([
  // Documentation
  ".md", ".mdx", ".txt", ".rst", ".adoc", ".markdown",
  // Styles
  ".css", ".scss", ".less", ".sass", ".styl",
  // Images / media
  ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".avif",
  // Type declarations (no runtime code)
  ".d.ts", ".d.mts",
  // Lock files are caught by filename pattern below
]);

const NON_CODE_FILENAME_PATTERNS = [
  /-lock\.json$/i,
  /-lock\.yaml$/i,
  /^yarn\.lock$/i,
  /^pnpm-lock\.yaml$/i,
  /^package-lock\.json$/i,
  /^Cargo\.lock$/i,
  /^Gemfile\.lock$/i,
  /^go\.sum$/i,
  /\.generated\./i,
];

const NON_CODE_PREFIX_MATCHES = [
  ".editorconfig",
  ".gitignore",
  ".gitattributes",
  ".dockerignore",
  ".npmrc",
  ".nvmrc",
  ".prettierrc",
  ".eslintrc",
  ".stylelintrc",
  ".browserslistrc",
];

function isNonCodeFile(filePath: string): boolean {
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.includes(".")
    ? "." + fileName.split(".").slice(1).join(".")
    : "";

  if (ext && NON_CODE_EXTENSIONS.has(ext)) return true;
  if (NON_CODE_FILENAME_PATTERNS.some((p) => p.test(fileName))) return true;

  const key = fileName.startsWith(".") ? fileName : null;
  if (key && NON_CODE_PREFIX_MATCHES.includes(key)) return true;

  // Exclude files in docs/ or .github/ directories
  if (filePath.startsWith("docs/") || filePath.startsWith(".github/")) return true;

  return false;
}

/**
 * Filter diffs based on review focus.
 * Quality: keep all files.
 * Security / error_handling: exclude docs, styles, images, lock files, etc.
 */
export function filterDiffsByFocus(
  diffs: FileDiff[],
  focus: ReviewFocus
): FileDiff[] {
  if (focus === "quality") return diffs;
  return diffs.filter((d) => !isNonCodeFile(d.filePath));
}
