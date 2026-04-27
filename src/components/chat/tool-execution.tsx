'use client';

import { useState } from 'react';

export type ToolBlock = {
  tool_use_id: string;
  name: string;
  input: unknown;
  status: 'running' | 'done' | 'error';
  output?: unknown;
};

export function ToolExecution({ block }: { block: ToolBlock }) {
  const [open, setOpen] = useState(false);
  const statusDot =
    block.status === 'running'
      ? 'bg-amber-500 animate-pulse'
      : block.status === 'error'
        ? 'bg-red-500'
        : 'bg-emerald-500';
  return (
    <div className="my-2 rounded-md border border-border bg-muted/30 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`h-2 w-2 rounded-full ${statusDot}`} />
        <span className="font-medium">{block.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {open ? 'hide' : 'details'}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 px-3 py-2">
          <Section label="input">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
              {JSON.stringify(block.input, null, 2)}
            </pre>
          </Section>
          {block.status !== 'running' && (
            <Section label="output">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
                {typeof block.output === 'string'
                  ? block.output
                  : JSON.stringify(block.output, null, 2)}
              </pre>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
