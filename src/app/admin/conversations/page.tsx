import Link from 'next/link';
import { supabase, type ConversationRow } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Conversations — customerdog admin',
};

export default async function AdminConversationsPage() {
  const { data, error } = await supabase()
    .from('conversations')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(100);

  const rows = ((data as ConversationRow[] | null) ?? []).slice();

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
            <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Last 100 visitor sessions. Transcripts pulled from qlaud on
              demand.
            </p>
          </div>
          <SupabaseLink table="conversations" />
        </div>
      </header>

      {error ? <Banner>{error.message}</Banner> : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No conversations yet. As soon as a visitor sends their first
          message, you&apos;ll see it here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <Th>Started</Th>
                <Th>Visitor</Th>
                <Th>Contact</Th>
                <Th>Resolved</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <Td>{new Date(c.started_at).toLocaleString()}</Td>
                  <Td>
                    <code className="text-xs text-muted-foreground">
                      {c.anon_visitor_id.slice(0, 16)}…
                    </code>
                  </Td>
                  <Td>
                    {c.contact_email ? (
                      <span title={c.contact_email}>📧 {c.contact_email}</span>
                    ) : c.contact_phone ? (
                      <span>📞 {c.contact_phone}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td>
                    {c.resolved ? (
                      <span className="text-green-700">Yes</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/conversations/${c.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View →
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2">{children}</td>;
}
function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
      {children}
    </div>
  );
}

function SupabaseLink({ table }: { table: string }) {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  // Best-effort link to Supabase Studio's table editor. Pulls the project
  // ref from the URL (https://<ref>.supabase.co).
  const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co/.exec(url);
  if (!m) return null;
  return (
    <a
      href={`https://supabase.com/dashboard/project/${m[1]}/editor?schema=public`}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-muted-foreground hover:text-foreground"
    >
      Open {table} in Supabase ↗
    </a>
  );
}
