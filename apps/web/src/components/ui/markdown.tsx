"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";

const MERMAID_RE =
  /^(sequenceDiagram|flowchart|graph|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitgraph|mindmap|timeline|requirementDiagram)\b/;

const MERMAID_BLOCK_RE =
  /(```mermaid\n([\s\S]*?)\n```)|((?:^|\n)((?:sequenceDiagram|flowchart|graph|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitgraph|mindmap|timeline|requirementDiagram)\b)[\s\S]*?)(?=\n(?:##|\n\n|$))/g;

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const render = useCallback(async () => {
    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        themeVariables: { fontFamily: "inherit", fontSize: "13px" },
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
      });
      const id = `mermaid-md-${Math.random().toString(36).slice(2, 8)}`;
      const { svg: rendered } = await mermaid.render(id, code);
      setSvg(rendered);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to render diagram");
    }
  }, [code]);

  useEffect(() => {
    void render();
  }, [render]);

  if (error) {
    return (
      <pre className="rounded-lg border bg-muted/50 p-3 text-xs text-destructive overflow-x-auto">
        {code}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="flex justify-center overflow-x-auto my-2"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Split markdown into segments: normal markdown text and mermaid code blocks.
 * Returns an array of { type: 'md', content } and { type: 'mermaid', content }.
 */
function splitMermaidBlocks(md: string): Array<{ type: "md" | "mermaid"; content: string }> {
  const segments: Array<{ type: "md" | "mermaid"; content: string }> = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced mermaid block: ```mermaid ... ```
    if (line.trimStart() === "```mermaid" || line.trimStart() === "```mermaid ") {
      const block: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        block.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      if (block.length > 0) {
        segments.push({ type: "mermaid", content: block.join("\n") });
      }
      continue;
    }

    // Bare mermaid block: starts with a mermaid keyword, not inside a code fence
    const trimmed = line.trim();
    if (MERMAID_RE.test(trimmed)) {
      const block: string[] = [line];
      i++;

      // Collect lines until we hit a clear boundary
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.startsWith("##") || t.startsWith("# ")) break;
        if (lines[i].trimStart().startsWith("```")) break;

        if (t === "") {
          // Blank line: peek ahead
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j >= lines.length) {
            i = j; // consume trailing blanks
            break;
          }
          const next = lines[j].trim();
          if (next.startsWith("##") || next.startsWith("# ") || next.startsWith("```")) break;
          // If next line doesn't look like mermaid continuation, stop
          if (
            !next.startsWith(" ") &&
            !/^(loop|alt|else|opt|par|break|critical|rect|end|participant|actor|note|activate|deactivate)\b/.test(next) &&
            !/\w+[-.]--?>>?\w+:/.test(next) &&
            !/\w+--?>>?\w+:/.test(next) &&
            !MERMAID_RE.test(next)
          ) {
            break;
          }
          block.push(lines[i]);
          i++;
        } else {
          block.push(lines[i]);
          i++;
        }
      }

      // Trim trailing blanks
      while (block.length > 0 && block[block.length - 1].trim() === "") block.pop();
      if (block.length > 0) {
        segments.push({ type: "mermaid", content: block.join("\n") });
      }
      continue;
    }

    // Normal markdown line
    // Accumulate consecutive normal lines into one segment
    if (segments.length > 0 && segments[segments.length - 1].type === "md") {
      segments[segments.length - 1].content += "\n" + line;
    } else {
      segments.push({ type: "md", content: line });
    }
    i++;
  }

  return segments;
}

export function MarkdownRenderer({ children }: { children: string }) {
  const segments = useMemo(() => splitMermaidBlocks(children), [children]);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {segments.map((seg, idx) =>
        seg.type === "mermaid" ? (
          <MermaidBlock key={`mmd-${idx}`} code={seg.content} />
        ) : (
          <ReactMarkdown key={`md-${idx}`}>{seg.content}</ReactMarkdown>
        )
      )}
    </div>
  );
}
