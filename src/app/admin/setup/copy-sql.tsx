'use client';

import { useState } from 'react';

/** Code block with a copy-to-clipboard button. Used on /admin/setup
 *  so the operator can paste schema.sql into Supabase in one click. */
export function CopySqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {copied ? '✓ Copied to clipboard' : 'Copy schema SQL'}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? 'Hide SQL' : 'Show SQL'}
        </button>
      </div>
      {expanded ? (
        <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {sql}
        </pre>
      ) : null}
    </div>
  );
}
