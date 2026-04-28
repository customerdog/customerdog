'use client';

import { useState } from 'react';
import type { ThreadMessage } from '@/lib/qlaud';
import { MessageStream } from './message-stream';
import { InputBar } from './input-bar';

/**
 * Single-conversation chat surface for an anonymous visitor.
 *
 * No sidebar, no thread list, no search — one visitor = one rolling
 * conversation tied to their cd_thread cookie. Server-side /api/chat
 * issues the cookie on first message; the client never sees the
 * thread id directly.
 *
 * Two render modes:
 *   "page"   — full screen with header showing company name. Used at
 *              /chat for the standalone "support.theircompany.com"
 *              deployment.
 *   "embed"  — no header, transparent background, sized to fit inside
 *              an iframe. Used at /embed for the script-tag widget.
 */
export function ChatShell({
  companyName = 'Support',
  brandColor,
  mode = 'page',
}: {
  companyName?: string;
  brandColor?: string;
  mode?: 'page' | 'embed';
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  // Optional: apply brand color as CSS variable so child components
  // pick it up via var(--brand-color).
  const style = brandColor
    ? ({ ['--brand-color' as never]: brandColor } as React.CSSProperties)
    : undefined;

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground"
      style={style}
    >
      {mode === 'page' ? (
        <header className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
          <span className="text-base">🐕</span>
          <span className="text-sm font-semibold">{companyName} support</span>
        </header>
      ) : null}

      <main className="flex flex-1 flex-col overflow-hidden">
        {messages.length === 0 ? (
          <EmptyState companyName={companyName} />
        ) : (
          <MessageStream
            messages={messages}
            streaming={streaming}
            hasOlder={false}
            loadingOlder={false}
            onLoadOlder={() => {}}
          />
        )}
        <InputBar
          disabled={streaming}
          onTurnStart={(userMsg) => {
            setStreaming(true);
            setMessages((prev) => [...prev, userMsg]);
          }}
          onAssistantUpdate={(msg) => {
            setMessages((prev) => {
              const i = prev.findIndex((m) => m.seq === msg.seq);
              if (i === -1) return [...prev, msg];
              const next = prev.slice();
              next[i] = msg;
              return next;
            });
          }}
          onTurnEnd={() => setStreaming(false)}
        />
      </main>
    </div>
  );
}

function EmptyState({ companyName }: { companyName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="text-3xl">🐕</div>
      <h2 className="mt-3 text-lg font-semibold">
        Hi! I&apos;m the {companyName} AI assistant.
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Ask me anything — about our product, your account, or to get
        you connected with a human.
      </p>
    </div>
  );
}
