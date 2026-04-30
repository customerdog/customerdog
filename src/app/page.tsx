import Link from 'next/link';
import { DogLogo } from '@/components/dog-logo';
import { getConfig } from '@/lib/supabase';
import { getMissingRequiredEnv } from '@/lib/setup-check';
import { SetupScreen } from '@/components/setup-screen';

export const dynamic = 'force-dynamic';

/**
 * Visitor landing. The real product surface is /chat (full-page chat)
 * or the embeddable widget on the company's own site — this page is
 * just a friendly entry point if someone navigates to the bare deploy
 * URL.
 *
 * Reads the company name from the config row so each clone-and-deploy
 * looks like the company's own product.
 */
export default async function LandingPage() {
  const missing = getMissingRequiredEnv();
  if (missing.length > 0) {
    return <SetupScreen missing={missing} />;
  }

  let companyName = 'Your Company';
  let configured = false;
  try {
    const cfg = await getConfig();
    companyName = cfg.company_name;
    configured = cfg.company_name !== 'Your Company';
  } catch {
    // Supabase reachable but query failed (e.g., schema not run yet).
    // Render generic landing so first-deploy visitors aren't greeted
    // with a 500.
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <DogLogo size={28} />
          {companyName}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/admin/login"
            className="text-muted-foreground hover:text-foreground"
          >
            Admin
          </Link>
        </nav>
      </header>

      <section className="flex flex-1 flex-col justify-center py-16">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Hi! I&apos;m the {companyName} AI assistant.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Ask me anything about our product, policies, or your account. If I
          can&apos;t resolve it, I&apos;ll help you reach a human.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/chat"
            className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Start a chat →
          </Link>
        </div>

        {!configured ? (
          <p className="mt-12 max-w-xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Setup not finished:</strong> sign in at{' '}
            <Link href="/admin/login" className="underline">
              /admin/login
            </Link>{' '}
            and add some knowledge base sources at <code>/admin/kb</code>{' '}
            — the AI has nothing to answer from yet.
          </p>
        ) : null}
      </section>

      <footer className="mt-auto pt-12 text-xs text-muted-foreground">
        Powered by{' '}
        <a
          href="https://github.com/customerdog/customerdog"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          customerdog
        </a>{' '}
        · Open source
      </footer>
    </main>
  );
}
