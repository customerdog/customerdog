import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DogLogo } from '@/components/dog-logo';
import { CopySqlBlock } from './copy-sql';
import { getSchemaSql } from '@/lib/schema-sql';
import { getSupabaseSqlEditorUrl, isSchemaCurrent } from '@/lib/admin-guard';
import { getLastMigrationError, tryAutoMigrate } from '@/lib/auto-migrate';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Install database schema — customerdog admin',
};

/**
 * Schema-install setup page. Reachable in two ways:
 *   1. Other admin pages call requireSchema() and redirect here when
 *      the config table is missing (most common — first deploy).
 *   2. Direct navigation by an operator who wants to re-run the schema.
 *
 * If the schema is already installed, redirect back to /admin so the
 * page can't be reached after the fact.
 */
export default async function AdminSetupPage() {
  // Step 1 — schema already current? Bounce back to /admin.
  // CRITICAL: this MUST use the same probe requireSchema uses
  // (the LATEST_TABLE in admin-guard.ts), or we get a redirect loop:
  // /admin sees the latest table missing → redirects here →
  // here sees an OLDER table and thinks schema is fine → redirects
  // back to /admin → … too many redirects.
  if (await isSchemaCurrent()) redirect('/admin');

  // Step 2 — self-heal via auto-migrate. If it works, schema is current
  // and /admin will render. If it fails (no DATABASE_URL, wrong pooler,
  // etc.) we fall through to the manual click-to-install UI below,
  // with the migration error displayed in an amber banner.
  const autoMigrated = await tryAutoMigrate();
  if (autoMigrated && (await isSchemaCurrent())) redirect('/admin');

  const sql = getSchemaSql();
  const sqlEditorUrl = getSupabaseSqlEditorUrl();
  const migrationError = getLastMigrationError();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Admin
        </Link>
        <div className="flex items-center gap-3 text-2xl">
          <DogLogo size={32} />
          <span className="font-semibold tracking-tight">
            One last step: install the database schema
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Your customerdog deploy can reach Supabase, but the tables it
          needs aren&apos;t created yet. This is a one-time install.
        </p>
      </header>

      {migrationError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Auto-install was attempted and failed</p>
          <p className="mt-1">
            customerdog tried to run <code>schema.sql</code> automatically
            via your <code>DATABASE_URL</code>, but Postgres rejected it:
          </p>
          <pre className="mt-2 overflow-auto rounded bg-white px-2 py-1 font-mono text-[11px]">
            {migrationError}
          </pre>
          <p className="mt-2">
            Most common fixes:
          </p>
          <ul className="ml-5 mt-1 list-disc space-y-0.5 text-xs">
            <li>
              Use the <strong>Session pooler</strong> URL (port <code>5432</code>),
              not the Transaction pooler — Transaction pooler can reject
              multi-statement DDL.
            </li>
            <li>
              Verify the password in your URL hasn&apos;t been rotated since
              you grabbed it.
            </li>
            <li>
              Ensure the project isn&apos;t paused (Supabase free-tier
              projects sleep after a week of inactivity — wake by
              opening the dashboard).
            </li>
          </ul>
          <p className="mt-2 text-xs">
            Or skip this entirely and follow the 3-step manual install
            below — equally fine.
          </p>
        </div>
      ) : null}

      <ol className="space-y-6 rounded-lg border border-border p-5 text-sm">
        <li className="space-y-3">
          <p>
            <strong>Step 1.</strong> Copy the database schema:
          </p>
          <CopySqlBlock sql={sql} />
        </li>

        <li className="space-y-3">
          <p>
            <strong>Step 2.</strong> Open your Supabase SQL Editor and
            paste:
          </p>
          <a
            href={sqlEditorUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Open Supabase SQL Editor ↗
          </a>
          <p className="text-xs text-muted-foreground">
            Paste the SQL into the empty query, click <strong>Run</strong>{' '}
            (bottom-right). You should see &ldquo;Success. No rows
            returned.&rdquo;
          </p>
        </li>

        <li className="space-y-3">
          <p>
            <strong>Step 3.</strong> Come back and continue:
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            I&apos;ve run it — continue to admin →
          </Link>
          <p className="text-xs text-muted-foreground">
            If this still bounces back here, the SQL didn&apos;t finish.
            Check the Supabase SQL Editor for any error messages and try
            again.
          </p>
        </li>
      </ol>

      <details className="rounded-md border border-border px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Want zero-click setup next time? Set DATABASE_URL.
        </summary>
        <div className="mt-2 space-y-2 text-muted-foreground">
          <p>
            If you set the optional <code>DATABASE_URL</code> env var
            (Supabase → Settings → Database → Connection string →
            <strong> Transaction pooler</strong>, port 6543), customerdog
            opens a direct Postgres connection on the first admin page
            load and runs <code>schema.sql</code> for you. The schema is
            idempotent, so it&apos;s safe to ship with this on permanently.
          </p>
          <p>
            We use the official <code>pg</code> driver, dynamically
            imported only when this path actually fires — so functions
            that never need a migration don&apos;t pay the cold-start cost.
          </p>
        </div>
      </details>
    </main>
  );
}
