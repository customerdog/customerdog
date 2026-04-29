import Link from 'next/link';
import { listSources } from '@/lib/kb';
import { CRAWL_LIMIT } from '@/lib/kb-crawl';
import { requireSetup } from "@/lib/admin-guard";
import {
  addMarkdownAction,
  addUrlAction,
  crawlSiteAction,
  deleteSourceAction,
  toggleActiveAction,
} from './actions';

export const dynamic = 'force-dynamic';
// Site crawl can stack 50 fetches × parsing — bump well past the
// default. Hobby tier ignores values > 10s; Pro/Enterprise honor it.
export const maxDuration = 60;

export const metadata = {
  title: 'Knowledge base — customerdog admin',
};

const ADD_FLASH: Record<string, string> = {
  url: 'URL fetched + added.',
  markdown: 'Markdown added.',
  // 'crawl' — handled inline below to incorporate query-string counts.
};

function crawlFlashFromQuery(sp: {
  count?: string;
  discovered?: string;
  skipped?: string;
  failed?: string;
}): string {
  const added = sp.count ?? '0';
  const discovered = sp.discovered ?? '0';
  const skipped = sp.skipped ?? '0';
  const failed = sp.failed ?? '0';
  const parts = [`Added ${added}/${discovered} pages`];
  if (Number(skipped) > 0) parts.push(`${skipped} were already indexed`);
  if (Number(failed) > 0)
    parts.push(`${failed} failed to fetch (delete + retry if needed)`);
  return parts.join(' · ') + '.';
}

export default async function AdminKbPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    added?: string;
    count?: string;
    discovered?: string;
    skipped?: string;
    failed?: string;
  }>;
}) {
  await requireSetup();
  const sp = await searchParams;
  const sources = await listSources();
  const totalBytes = sources
    .filter((s) => s.active)
    .reduce((n, s) => n + s.parsed_content.length, 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 space-y-10">
      <header className="space-y-3">
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everything active here is concatenated into the AI&apos;s system
          prompt and cached on Anthropic&apos;s side via{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">cache_control</code>,
          so the long context is cheap on every turn. Add docs URLs (we&apos;ll
          fetch + parse) or paste markdown directly.
        </p>
        <p className="text-xs text-muted-foreground">
          {sources.filter((s) => s.active).length} active source(s) ·{' '}
          {(totalBytes / 1024).toFixed(1)} KB total
        </p>
      </header>

      {sp.error ? (
        <Banner kind="error">{sp.error}</Banner>
      ) : sp.added === 'crawl' ? (
        <Banner kind="ok">{crawlFlashFromQuery(sp)}</Banner>
      ) : sp.added ? (
        <Banner kind="ok">{ADD_FLASH[sp.added] ?? 'Added.'}</Banner>
      ) : null}

      {/* ─── Add URL ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Add a URL
        </h2>
        <form action={addUrlAction} className="flex gap-2">
          <input
            type="url"
            name="url"
            required
            placeholder="https://docs.yourcompany.com/getting-started"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Fetch + add
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          Server fetches the page, strips HTML, stores up to 200KB of plain
          text. JS-rendered pages won&apos;t parse well — paste markdown
          instead for those.
        </p>
      </section>

      {/* ─── Crawl entire site ────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Crawl an entire docs site
        </h2>
        <form action={crawlSiteAction} className="flex gap-2">
          <input
            type="url"
            name="url"
            required
            placeholder="https://docs.yourcompany.com/"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Crawl + add
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          Tries <code>sitemap.xml</code> first, falls back to extracting
          same-origin links from the page. Caps at {CRAWL_LIMIT} pages
          per run; URLs already in the list above are skipped, so you
          can re-run after adding more docs.
        </p>
      </section>

      {/* ─── Add Markdown ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Paste markdown
        </h2>
        <form action={addMarkdownAction} className="space-y-2">
          <input
            type="text"
            name="label"
            required
            placeholder="Label (e.g., 'Refund policy v2')"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <textarea
            name="content"
            required
            rows={8}
            placeholder="# Heading…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary/50"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add
            </button>
          </div>
        </form>
      </section>

      {/* ─── Source list ──────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sources ({sources.length})
        </h2>
        {sources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No knowledge yet. Add one above and the AI starts answering from it.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 px-4 py-3 text-sm"
              >
                <span
                  className={`mt-0.5 inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold uppercase ${
                    s.type === 'url'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {s.type}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium" title={s.source}>
                    {s.source}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(s.parsed_content.length / 1024).toFixed(1)} KB ·{' '}
                    {new Date(s.updated_at).toLocaleDateString()}
                    {!s.active ? (
                      <span className="ml-2 text-amber-700">disabled</span>
                    ) : null}
                  </div>
                </div>
                <form action={toggleActiveAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={String(!s.active)}
                  />
                  <button
                    type="submit"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {s.active ? 'Disable' : 'Enable'}
                  </button>
                </form>
                <form action={deleteSourceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: 'ok' | 'error';
  children: React.ReactNode;
}) {
  const cls =
    kind === 'ok'
      ? 'border-green-300 bg-green-50 text-green-900'
      : 'border-red-300 bg-red-50 text-red-900';
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${cls}`}
      role="status"
    >
      {children}
    </div>
  );
}
