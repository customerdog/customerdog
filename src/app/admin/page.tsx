import Link from 'next/link';
import { signOutAdmin } from './login/actions';
import { requireSchema } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin — customerdog',
};

/**
 * Admin dashboard. Placeholder layout for the full nav arriving in
 * later commits (KB / Conversations / Activity / Settings / Embed).
 *
 * This page is reachable only after middleware verifies cd_admin cookie;
 * if the cookie is missing or expired you're already on /admin/login.
 */
export default async function AdminDashboardPage() {
  await requireSchema();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">customerdog admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;re signed in.
          </p>
        </div>
        <form action={signOutAdmin}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Sign out
          </button>
        </form>
      </header>

      <nav className="mt-10 grid gap-3 sm:grid-cols-2">
        <AdminCard
          href="/admin/kb"
          title="Knowledge base"
          detail="Paste docs URLs or markdown the AI learns from."
        />
        <AdminCard
          href="/admin/conversations"
          title="Conversations"
          detail="Browse past visitor sessions and read transcripts."
        />
        <AdminCard
          href="/admin/activity"
          title="Activity log"
          detail="Every email sent, ticket filed, contact captured."
        />
        <AdminCard
          href="/admin/settings"
          title="Settings"
          detail="Brand color, escalation destination, contact policy."
        />
        <AdminCard
          href="/admin/embed"
          title="Embed widget"
          detail="Copy the script snippet to add the chat to your site."
        />
      </nav>
    </main>
  );
}

function AdminCard({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-background px-4 py-3 transition hover:border-primary/40"
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </Link>
  );
}
