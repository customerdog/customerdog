'use client';

import { useState } from 'react';

/** Code-block + copy-to-clipboard button. Client component because
 *  navigator.clipboard isn't available in server components. */
export function CopySnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some hosts disable clipboard in iframes — show a fallback.
      setCopied(false);
    }
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-3 font-mono text-xs">
        {snippet}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
