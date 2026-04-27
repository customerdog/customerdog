'use client';

import { useRef, useState } from 'react';
import type { ThreadMessage } from '@/lib/qlaud';
import { parseChatStream } from '@/lib/qlaud-stream';

// Composes the user's message and drives the streaming turn:
//   1. POST /api/chat with the message → SSE response
//   2. Parse the SSE into typed events
//   3. Build up the in-progress assistant message and push updates to
//      ChatShell on every delta
//   4. On message_stop, flip streaming off — qlaud has already persisted
//      the assistant turn server-side.
export function InputBar({
  threadId,
  disabled,
  onTurnStart,
  onAssistantUpdate,
  onTurnEnd,
}: {
  threadId: string;
  disabled: boolean;
  onTurnStart: (userMsg: ThreadMessage) => void;
  onAssistantUpdate: (msg: ThreadMessage) => void;
  onTurnEnd: () => void;
}) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';

    const now = Date.now();
    onTurnStart({
      seq: -1,
      role: 'user',
      content: [{ type: 'text', text: trimmed }],
      request_id: null,
      created_at: now,
    });

    // Push an empty assistant placeholder immediately so the streaming
    // cursor renders before the first byte arrives. Subsequent updates
    // mutate this same row (matched on seq below). Without this the
    // user sees a totally blank screen during the first ~200ms of
    // model latency and assumes nothing is happening.
    const errorMessage = (text: string): ThreadMessage => ({
      seq: 1_000_000_000,
      role: 'assistant',
      content: [{ type: 'text', text: `⚠️ ${text}` }],
      request_id: null,
      created_at: Date.now(),
    });
    onAssistantUpdate({
      seq: 1_000_000_000,
      role: 'assistant',
      content: [],
      request_id: null,
      created_at: now,
    });

    let res: Response;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId, message: trimmed }),
      });
    } catch (e) {
      onAssistantUpdate(errorMessage(`network error: ${(e as Error).message}`));
      onTurnEnd();
      return;
    }

    if (!res.ok || !res.body) {
      // Read the error body — our route handlers return JSON like
      // { error, detail } on failure. Surface it so users (and we) can
      // see what went wrong instead of staring at a blank screen.
      const detail = await res.text().catch(() => '');
      let parsed: { error?: string; detail?: string } | null = null;
      try {
        parsed = detail ? JSON.parse(detail) : null;
      } catch {
        /* not JSON, fall through */
      }
      const msg = parsed?.detail || parsed?.error || detail.slice(0, 300) || `HTTP ${res.status}`;
      onAssistantUpdate(errorMessage(msg));
      onTurnEnd();
      return;
    }

    // Track the in-progress assistant message — we mutate this object as
    // deltas arrive and push the latest snapshot up to ChatShell.
    type Block =
      | { type: 'text'; text: string }
      | { type: 'thinking'; thinking: string }
      | { type: 'tool_use'; id: string; name: string; input_json: string; input?: unknown }
      | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error: boolean };

    const blocksByIndex = new Map<number, Block>();
    const order: number[] = [];

    const buildSnapshot = (): ThreadMessage => {
      const content = order
        .map((i) => blocksByIndex.get(i))
        .filter((b): b is Block => Boolean(b))
        .map((b) => {
          if (b.type === 'tool_use') {
            let input: unknown = b.input;
            if (input === undefined && b.input_json) {
              try {
                input = JSON.parse(b.input_json);
              } catch {
                input = b.input_json;
              }
            }
            return { type: 'tool_use', id: b.id, name: b.name, input };
          }
          return b;
        });
      return {
        seq: 1_000_000_000,
        role: 'assistant',
        content,
        request_id: null,
        created_at: Date.now(),
      };
    };

    const ensure = (i: number, block: Block) => {
      if (!blocksByIndex.has(i)) {
        blocksByIndex.set(i, block);
        order.push(i);
      }
    };

    let sawAnyEvent = false;
    try {
      for await (const ev of parseChatStream(res.body)) {
        sawAnyEvent = true;
        switch (ev.type) {
          case 'text_delta': {
            const existing = blocksByIndex.get(ev.index);
            if (existing && existing.type === 'text') {
              existing.text += ev.text;
            } else {
              ensure(ev.index, { type: 'text', text: ev.text });
            }
            break;
          }
          case 'thinking_delta': {
            const existing = blocksByIndex.get(ev.index);
            if (existing && existing.type === 'thinking') {
              existing.thinking += ev.text;
            } else {
              ensure(ev.index, { type: 'thinking', thinking: ev.text });
            }
            break;
          }
          case 'tool_use_start': {
            ensure(ev.index, {
              type: 'tool_use',
              id: ev.tool_use_id,
              name: ev.name,
              input_json: '',
            });
            break;
          }
          case 'tool_use_input_delta': {
            const existing = blocksByIndex.get(ev.index);
            if (existing && existing.type === 'tool_use') {
              existing.input_json += ev.partial_json;
            }
            break;
          }
          case 'content_block_stop':
          case 'message_start':
            break;
          case 'message_stop':
            break;
        }
        onAssistantUpdate(buildSnapshot());
      }
    } catch (e) {
      onAssistantUpdate(errorMessage(`stream interrupted: ${(e as Error).message}`));
    } finally {
      // If qlaud returned 200 with an empty body the cursor would
      // blink forever otherwise — surface that as a clear failure.
      if (!sawAnyEvent) {
        onAssistantUpdate(
          errorMessage('upstream returned no events. Check Vercel function logs for /api/chat.'),
        );
      }
      onTurnEnd();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function autoSize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }

  return (
    <div className="border-t border-border bg-background">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2 focus-within:border-primary/60">
          <textarea
            ref={taRef}
            value={text}
            onChange={autoSize}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message qlaud…"
            disabled={disabled}
            className="flex-1 resize-none bg-transparent py-1 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={disabled || !text.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
            aria-label="Send"
          >
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Powered by{' '}
          <a
            href="https://qlaud.ai"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            qlaud
          </a>{' '}
          · Threads, tools, and search built in.
        </p>
      </div>
    </div>
  );
}
