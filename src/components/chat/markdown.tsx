'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const inline = !className;
            if (inline) {
              return (
                <code
                  className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          a({ children, ...props }) {
            return (
              <a
                {...props}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
