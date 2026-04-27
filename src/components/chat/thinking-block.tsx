'use client';

import { useState } from 'react';

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2 rounded-md border border-border/60 bg-muted/40 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-muted-foreground hover:text-foreground"
      >
        <span className="font-medium">Thinking</span>
        <span className="text-[10px]">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <pre className="whitespace-pre-wrap px-3 pb-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {text}
        </pre>
      )}
    </div>
  );
}
