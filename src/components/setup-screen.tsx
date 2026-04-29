import type { MissingVar } from '@/lib/setup-check';

/**
 * Friendly half-configured-deploy screen. Rendered by visitor pages
 * (/, /chat, /embed) AND /admin/login when required env vars haven't
 * been set yet. Beats a stack trace from inside env.ts.
 *
 * Two render modes:
 *   "page"  — full-screen panel for / + /chat + /admin/login
 *   "embed" — same content, styled to fit inside the iframe widget
 */
export function SetupScreen({
  missing,
  mode = 'page',
}: {
  missing: MissingVar[];
  mode?: 'page' | 'embed';
}) {
  return (
    <main
      className={
        mode === 'page'
          ? 'mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12'
          : 'flex h-full flex-col justify-center px-6 py-8'
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-2xl">
          <span>🐕</span>
          <span className="font-semibold tracking-tight">
            customerdog setup isn&apos;t finished
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          This deploy is missing required environment variables. Once they
          are set, redeploy and this screen goes away.
        </p>

        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Missing
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {missing.map((v) => (
              <li key={v.name}>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-amber-900">
                  {v.name}
                </code>
                <span className="ml-2 text-amber-900">— {v.reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">What to do:</p>
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>
              Open your hosting provider&apos;s settings (e.g., Vercel →
              Settings → Environment Variables).
            </li>
            <li>
              Add each missing variable above. See{' '}
              <a
                href="https://github.com/customerdog/customerdog/blob/main/.env.example"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                .env.example
              </a>{' '}
              for what each value should look like.
            </li>
            <li>Redeploy.</li>
          </ol>
        </div>

        {mode === 'page' ? (
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            Operator? Run <code className="rounded bg-muted px-1 py-0.5">npm run check</code>{' '}
            locally to live-probe everything in one go before redeploying.
          </p>
        ) : null}
      </div>
    </main>
  );
}
