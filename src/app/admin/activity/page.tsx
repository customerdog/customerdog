import Link from 'next/link';
import { requireSchema } from '@/lib/admin-guard';
import { supabase, type ActionRow } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Activity — customerdog admin',
};

const TYPE_BADGE: Record<ActionRow['type'], { label: string; cls: string }> = {
  ticket_created: {
    label: 'Ticket',
    cls: 'bg-purple-100 text-purple-800',
  },
  email_sent: { label: 'Email', cls: 'bg-blue-100 text-blue-800' },
  contact_collected: {
    label: 'Contact',
    cls: 'bg-green-100 text-green-800',
  },
};

export default async function AdminActivityPage() {
  await requireSchema();
  const { data, error } = await supabase()
    .from('actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data as ActionRow[] | null) ?? [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Admin
        </Link>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Last 200 actions: tickets filed, emails sent, contact info
              captured.
            </p>
          </div>
          <SupabaseLink />
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error.message}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing yet. Once visitors start escalating, every ticket and
          email will land here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <Th>When</Th>
                <Th>Type</Th>
                <Th>Summary</Th>
                <Th>Conversation</Th>
                <Th>Link</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const badge = TYPE_BADGE[a.type];
                const summary = renderSummary(a);
                return (
                  <tr key={a.id} className="border-t border-border align-top">
                    <Td>{new Date(a.created_at).toLocaleString()}</Td>
                    <Td>
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </Td>
                    <Td className="max-w-md">
                      <span className="line-clamp-2">{summary}</span>
                    </Td>
                    <Td>
                      {a.conversation_id ? (
                        <Link
                          href={`/admin/conversations/${a.conversation_id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View →
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td>
                      {a.result_url ? (
                        <a
                          href={a.result_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Open ↗
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function renderSummary(a: ActionRow): string {
  const p = a.payload;
  switch (a.type) {
    case 'ticket_created':
      return String((p as { summary?: string }).summary ?? '(no summary)');
    case 'email_sent':
      return `${(p as { subject?: string }).subject ?? ''} → ${(p as { to?: string }).to ?? ''}`;
    case 'contact_collected': {
      const o = p as { email?: string | null; phone?: string | null };
      return [o.email, o.phone].filter(Boolean).join(' · ') || '(empty)';
    }
  }
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left font-medium">{children}</th>;
}
function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2 ${className ?? ''}`}>{children}</td>;
}

function SupabaseLink() {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co/.exec(url);
  if (!m) return null;
  return (
    <a
      href={`https://supabase.com/dashboard/project/${m[1]}/editor?schema=public`}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-muted-foreground hover:text-foreground"
    >
      Open in Supabase ↗
    </a>
  );
}
