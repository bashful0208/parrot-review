"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

const MERMAID_KEYWORDS = [
  "sequenceDiagram",
  "flowchart",
  "graph",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "gantt",
  "pie",
  "journey",
  "gitgraph",
  "mindmap",
  "timeline",
  "requirementDiagram",
];

/**
 * Check if a line looks like mermaid syntax (indented block content,
 * arrows, keywords like loop/alt/end, participant declarations, etc.)
 */
function isMermaidLine(line: string): boolean {
  if (line === "") return true; // blank lines within a block are fine
  if (line.startsWith(" ") || line.startsWith("\t")) return true; // indented = diagram content
  const t = line.trim();
  if (/^(loop|alt|else|opt|par|break|critical|rect|end)\b/.test(t)) return true;
  if (/\w+--?>>\w+:/.test(t)) return true; // arrows: A->>B: msg
  if (/^participant\s/.test(t) || /^actor\s/.test(t)) return true;
  if (/^note\s/.test(t)) return true;
  if (/^activate\s|^deactivate\s/.test(t)) return true;
  return false;
}

/**
 * Wrap bare mermaid blocks (not already in fenced code blocks) with ```mermaid fences.
 * This handles legacy data where mermaid syntax was inserted as plain text.
 */
function wrapBareMermaid(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inFence = false;
  let inMermaid = false;
  let mermaidLines: string[] = [];

  const flushMermaid = () => {
    // Trim trailing blank lines
    while (mermaidLines.length > 0 && mermaidLines[mermaidLines.length - 1].trim() === "") {
      mermaidLines.pop();
    }
    if (mermaidLines.length > 0) {
      result.push("```mermaid", ...mermaidLines, "```");
    }
    mermaidLines = [];
    inMermaid = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks
    if (line.trimStart().startsWith("```")) {
      if (inMermaid) flushMermaid();
      inFence = !inFence;
      result.push(line);
      continue;
    }

    if (inFence) {
      result.push(line);
      continue;
    }

    const trimmed = line.trim();

    // Detect bare mermaid: line starts with a mermaid keyword
    if (!inMermaid && MERMAID_KEYWORDS.some((kw) => trimmed.startsWith(kw))) {
      inMermaid = true;
    }

    if (inMermaid) {
      // Check if this blank line is followed by more mermaid content
      if (trimmed === "") {
        // Look ahead: if next non-blank line is still mermaid, keep going
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        const nextLine = j < lines.length ? lines[j] : "";
        if (nextLine !== "" && isMermaidLine(nextLine)) {
          mermaidLines.push(line);
        } else {
          flushMermaid();
          result.push(line);
        }
      } else if (isMermaidLine(line)) {
        mermaidLines.push(line);
      } else {
        // Not mermaid syntax — end block
        flushMermaid();
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  if (inMermaid) flushMermaid();

  return result.join("\n");
}

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

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const isMermaid = match && match[1] === "mermaid";
    const code = String(children).replace(/\n$/, "");

    if (isMermaid) {
      return <MermaidBlock code={code} />;
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export function MarkdownRenderer({ children }: { children: string }) {
  const content = useMemo(() => wrapBareMermaid(children), [children]);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
