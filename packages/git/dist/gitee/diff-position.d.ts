/**
 * Convert a (filePath, fileLine, side) tuple into the unified-diff line
 * position that Gitee's PR comments API expects. Position 1 is the line just
 * after the first `@@` hunk header; subsequent `@@` headers count too.
 */
export declare function computeDiffPosition(patch: string | null | undefined, fileLine: number, side: "LEFT" | "RIGHT"): number | null;
