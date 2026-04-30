import Link from 'next/link';
import { requireSetup } from "@/lib/admin-guard";
import { getConfig } from '@/lib/supabase';
import { CopySnippet } from './copy-snippet';
import { PreviewIframe } from './preview-iframe';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Embed widget — customerdog admin',
};

export default async function AdminEmbedPage() {
  await requireSetup();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  let cfg: { brand_color?: string; company_name?: string } = {};
  try {
    cfg = await getConfig();
  } catch {
    /* ignore — preview will use defaults */
  }
  const color = cfg.brand_color ?? '#dc2626';

  const snippet = appUrl
    ? `<script src="${appUrl}/widget.js" data-color="${color}" defer></script>`
    : '<!-- Set NEXT_PUBLIC_APP_URL in your env, then come back here. -->';

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-10">
      <header className="space-y-2">
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Embed the widget
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Drop this <code>&lt;script&gt;</code> tag into the{' '}
          <code>&lt;head&gt;</code> or just before <code>&lt;/body&gt;</code> of
          your site. The bubble appears bottom-right; visitors click to chat.
          No build step, no host-page dependencies.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Snippet
        </h2>
        <CopySnippet snippet={snippet} />
        <p className="text-xs text-muted-foreground">
          Optional attributes: <code>data-color</code> (defaults to your
          brand color), <code>data-label</code> (aria-label), <code>data-icon</code>{' '}
          (single emoji or character on the bubble).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Live preview
        </h2>
        {appUrl ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              The iframe below is exactly what visitors see when they click
              the bubble.
            </p>
            <PreviewIframe src={`${appUrl}/embed`} title="Widget preview" />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Set <code>NEXT_PUBLIC_APP_URL</code> to see a live preview here.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Or host the chat at its own URL
        </h2>
        <p className="text-sm text-muted-foreground">
          You can also point a subdomain (e.g.,{' '}
          <code>support.yourcompany.com</code>) at this deployment and link
          to <code>{appUrl || '<your-deploy>'}/chat</code>. No widget needed.
        </p>
      </section>
    </main>
  );
}
