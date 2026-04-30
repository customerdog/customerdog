'use client';

import { useState } from 'react';
import { DogLogo } from '@/components/dog-logo';
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
      // h-dvh (dynamic viewport height) instead of h-screen so Safari's
      // address bar / soft keyboard don't push the input bar off-screen
      // on mobile. h-screen = 100vh, which on iOS Safari includes the
      // address-bar area even when it's covering the bottom of content.
      className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground"
      style={style}
    >
      {mode === 'page' ? (
        <header className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
          <DogLogo size={20} />
          <span className="text-sm font-semibold">{companyName} support</span>
        </header>
      ) : (
        <header className="flex items-center justify-between border-b border-border bg-background px-3 py-2">
          <span className="text-sm font-semibold">{companyName}</span>
          <button
            type="button"
            onClick={() => {
              // Tell the host page (widget.js) to hide the iframe.
              window.parent?.postMessage({ type: 'customerdog:close' }, '*');
            }}
            aria-label="Close chat"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
      )}

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
      <DogLogo size={56} />
      <h2 className="mt-4 text-lg font-semibold">
        Hi! I&apos;m the {companyName} AI assistant.
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Ask me anything — about our product, your account, or to get
        you connected with a human.
      </p>
    </div>
  );
}
