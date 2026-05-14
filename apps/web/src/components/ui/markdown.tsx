"use client";

import ReactMarkdown from "react-markdown";

export function MarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
