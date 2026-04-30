/**
 * Convert a (filePath, fileLine, side) tuple into the unified-diff line
 * position that Gitee's PR comments API expects. Position 1 is the line just
 * after the first `@@` hunk header; subsequent `@@` headers count too.
 */
export function computeDiffPosition(patch, fileLine, side) {
    if (!patch)
        return null;
    const lines = patch.split("\n");
    let position = 0;
    let leftLine = 0;
    let rightLine = 0;
    let seenHunk = false;
    for (const line of lines) {
        if (line.startsWith("@@")) {
            const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
            if (!m)
                return null;
            leftLine = parseInt(m[1], 10) - 1;
            rightLine = parseInt(m[2], 10) - 1;
            if (seenHunk)
                position++;
            seenHunk = true;
            continue;
        }
        if (!seenHunk)
            continue;
        position++;
        if (line.startsWith("+")) {
            rightLine++;
            if (side === "RIGHT" && rightLine === fileLine)
                return position;
        }
        else if (line.startsWith("-")) {
            leftLine++;
            if (side === "LEFT" && leftLine === fileLine)
                return position;
        }
        else if (line.startsWith(" ") || line === "") {
            leftLine++;
            rightLine++;
            if (side === "RIGHT" && rightLine === fileLine)
                return position;
            if (side === "LEFT" && leftLine === fileLine)
                return position;
        }
    }
    return null;
}
