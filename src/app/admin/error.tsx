'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { DogLogo } from '@/components/dog-logo';

/**
 * Admin segment error boundary. Catches anything thrown during render
 * of /admin/* pages — almost always a Supabase query failure (schema
 * not run, wrong key, network blip).
 *
 * Without this, the operator sees Next.js's generic production error
 * page ("A server error occurred. Reload to try again.") with no
 * actionable hint. The page-level digest is still surfaced for
 * cross-referencing with Vercel logs, but the most likely causes are
 * called out up front.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Available in the browser console for the operator who's
    // debugging — the message itself is also logged to Vercel.
    console.error('[admin] render failed:', error);
  }, [error]);

  const msg = error.message ?? '';
  const guess = guessCause(msg);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <div className="space-y-5">
        <div className="flex items-center gap-3 text-2xl">
          <DogLogo size={32} />
          <span className="font-semibold tracking-tight">
            Something went wrong loading this admin page
          </span>
        </div>

        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Likely cause</p>
          <p className="mt-1">{guess}</p>
        </div>

        <details className="rounded-md border border-border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            Technical details
          </summary>
          <div className="mt-2 space-y-1 font-mono">
            <div>
              <span className="text-muted-foreground">message:</span> {msg || '(none)'}
            </div>
            {error.digest ? (
              <div>
                <span className="text-muted-foreground">digest:</span>{' '}
                <code className="rounded bg-muted px-1">{error.digest}</code>
                <span className="ml-2 text-muted-foreground">
                  (search Vercel function logs for this string to find the
                  full server-side trace)
                </span>
              </div>
            ) : null}
          </div>
        </details>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">What to try:</p>
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>
              Make sure you ran{' '}
              <a
                href="https://github.com/customerdog/customerdog/blob/main/supabase/schema.sql"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                supabase/schema.sql
              </a>{' '}
              in your Supabase SQL Editor. Without it, the tables this page
              reads from don&apos;t exist.
            </li>
            <li>
              Confirm <code>SUPABASE_SERVICE_ROLE_KEY</code> is the{' '}
              <strong>Secret</strong> key (or legacy <code>service_role</code>),
              NOT the publishable / <code>anon</code> key.
            </li>
            <li>
              Run <code>npm run check</code> locally with your production env
              vars — it live-probes Supabase + qlaud and tells you exactly
              what&apos;s wrong.
            </li>
          </ol>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/admin/setup"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Run setup
          </Link>
          <Link
            href="/admin"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Back to admin
          </Link>
        </div>
      </div>
    </main>
  );
}

function guessCause(msg: string): string {
  // Next.js production mode masks the actual error. Tell the operator
  // exactly where to find the real one — almost always in Vercel logs
  // under the digest we surface in the Technical details block.
  if (
    msg.includes('Server Components render') ||
    msg.includes('specific message is omitted')
  ) {
    return "Next.js hid the real error in production. Open Vercel → Project → Logs (or Runtime Logs), search for the digest above — the line right above it has the actual exception (almost always a Supabase or qlaud call). The most common cause right after a customerdog version bump is a NEW Supabase table the schema migration hasn't run yet — visit /admin/setup if so.";
  }
  // Supabase relation-not-found: PGRST205 (rest API) or "relation … does not exist"
  if (
    msg.includes('PGRST205') ||
    /relation .+ does not exist/i.test(msg) ||
    msg.includes("Could not find the table") ||
    msg.includes("Could not find the 'public.")
  ) {
    return "A Supabase table doesn't exist. If you just upgraded customerdog, the schema needs to be re-applied to add the new tables — go to /admin/setup. If this is a fresh deploy, run supabase/schema.sql in your Supabase SQL Editor.";
  }
  // Supabase auth/permission errors
  if (
    msg.includes('PGRST301') ||
    msg.includes('JWT') ||
    msg.includes('JWS') ||
    msg.includes('permission denied') ||
    /401|403/.test(msg)
  ) {
    return "Supabase rejected the API key. Double-check that SUPABASE_SERVICE_ROLE_KEY is the Secret / service_role key (not the publishable / anon key — both look like eyJ… JWTs) and that SUPABASE_URL matches the same project.";
  }
  // Network / DNS
  if (
    msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('fetch failed')
  ) {
    return "Couldn't reach Supabase. Check SUPABASE_URL is the correct project URL (https://<ref>.supabase.co) and that the project is awake (free-tier projects pause after a week of inactivity).";
  }
  // qlaud reachability
  if (msg.includes('qlaud') || msg.includes('/v1/')) {
    return "A qlaud call failed. Check QLAUD_KEY is valid and has admin scope. The most common 401 cause is rotation; mint a fresh key at qlaud.ai/keys.";
  }
  return "An unexpected error. Check the Vercel function logs for the full trace (search the digest above), or run `npm run check` locally with your production env to diagnose.";
}
