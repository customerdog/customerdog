import Link from 'next/link';
import { notFound } from 'next/navigation';
import { qlaud } from '@/lib/qlaud';
import { requireSetup } from "@/lib/admin-guard";
import { supabase, type ConversationRow } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Conversation — customerdog admin',
};

export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSetup();
  const { id } = await params;

  const { data: conv, error: convErr } = await supabase()
    .from('conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (convErr || !conv) {
    notFound();
  }
  const conversation = conv as ConversationRow;

  let messages: Array<{ seq: number; role: string; content: unknown }> = [];
  let transcriptError: string | null = null;
  try {
    const r = await qlaud.listThreadMessages({
      threadId: conversation.qlaud_thread_id,
      order: 'asc',
      limit: 200,
    });
    messages = r.data;
  } catch (e) {
    transcriptError = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/admin/conversations"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← All conversations
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Conversation transcript
        </h1>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <Row k="Started" v={new Date(conversation.started_at).toLocaleString()} />
          <Row
            k="Visitor"
            v={<code>{conversation.anon_visitor_id.slice(0, 24)}…</code>}
          />
          <Row
            k="qlaud thread"
            v={<code>{conversation.qlaud_thread_id.slice(0, 24)}…</code>}
          />
          <Row k="Resolved" v={conversation.resolved ? 'Yes' : 'No'} />
        </dl>
      </header>

      {transcriptError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Couldn&apos;t load transcript from qlaud: {transcriptError}
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Messages ({messages.length})
        </h2>
        <div className="space-y-3 rounded-lg border border-border p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No messages — visitor opened a session but didn&apos;t send anything.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.seq} className="text-sm">
                <div className="text-xs font-semibold text-muted-foreground">
                  {m.role === 'user' ? '👤 Visitor' : '🐕 Assistant'}
                </div>
                <div className="mt-1 whitespace-pre-wrap">
                  {renderContent(m.content)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Tool actions for this conversation (tickets filed, emails sent,
        etc.) are visible at{' '}
        <a
          href="https://qlaud.ai/usage"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          qlaud.ai/usage
        </a>{' '}
        — search by the qlaud thread id above.
      </p>
    </main>
  );
}

function renderContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === 'string') return b;
        if (b && typeof b === 'object') {
          const obj = b as { type?: string; text?: string; thinking?: string; name?: string };
          if (obj.type === 'text') return obj.text ?? '';
          if (obj.type === 'thinking') return `[thinking: ${obj.thinking?.slice(0, 80) ?? ''}…]`;
          if (obj.type === 'tool_use') return `[tool: ${obj.name}]`;
          if (obj.type === 'tool_result') return `[tool result]`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(content);
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="font-medium text-foreground">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
