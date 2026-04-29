import Link from 'next/link';
import { requireSetup } from "@/lib/admin-guard";
import { getConfig } from '@/lib/supabase';
import { saveSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Settings — customerdog admin',
};

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireSetup();
  const sp = await searchParams;
  const cfg = await getConfig();
  const destWarnings = checkDestinationConfig(cfg.ticket_destination, cfg.support_email);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The single Supabase <code>config</code> row. Power users can also
          edit it directly in Supabase&apos;s Table Editor.
        </p>
      </header>

      {sp.saved ? <Banner kind="ok">Saved.</Banner> : null}
      {sp.error ? <Banner kind="error">{sp.error}</Banner> : null}

      {destWarnings.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Ticket destination not fully configured</p>
          <p className="mt-1 text-xs">
            The AI will hit a runtime error when it tries to file a ticket.
            Fix one of the following:
          </p>
          <ul className="mt-2 ml-5 list-disc space-y-1 text-xs">
            {destWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form action={saveSettingsAction} className="space-y-5">
        <Field
          label="Company name"
          name="company_name"
          defaultValue={cfg.company_name}
          help="Shown to visitors on the landing + chat header."
        />
        <Field
          label="Brand color"
          name="brand_color"
          defaultValue={cfg.brand_color}
          type="color"
          help="Used as the accent color in the embeddable widget."
        />
        <Select
          label="Ticket destination"
          name="ticket_destination"
          defaultValue={cfg.ticket_destination}
          options={[
            { v: 'email', l: 'Email (via Resend)' },
            { v: 'slack', l: 'Slack (incoming webhook)' },
            { v: 'linear', l: 'Linear (creates an issue)' },
            { v: 'zendesk', l: 'Zendesk (creates a ticket)' },
          ]}
          help="Set the matching env vars for whichever you choose."
        />
        <Select
          label="Visitor contact required"
          name="visitor_contact_required"
          defaultValue={cfg.visitor_contact_required}
          options={[
            { v: 'none', l: 'Don\u2019t collect — escalate immediately' },
            { v: 'email', l: 'Require email' },
            { v: 'phone', l: 'Require phone' },
            { v: 'either', l: 'Require either email or phone' },
          ]}
          help="The AI refuses to file a ticket until contact is collected if you require it."
        />
        <Field
          label="Support email (shown to visitor on errors)"
          name="support_email"
          defaultValue={cfg.support_email ?? ''}
          type="email"
          help="If something fails server-side, the AI tells the visitor to reach out here."
        />
        <Textarea
          label="System prompt extras"
          name="system_prompt_extras"
          defaultValue={cfg.system_prompt_extras ?? ''}
          help="Free-form instructions appended to the system prompt. Tone of voice, things to never say, escalation language, etc."
          rows={6}
        />

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  help,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
      />
      {help ? (
        <span className="mt-1 block text-xs text-muted-foreground">{help}</span>
      ) : null}
    </label>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
  help,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { v: string; l: string }[];
  help?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
      {help ? (
        <span className="mt-1 block text-xs text-muted-foreground">{help}</span>
      ) : null}
    </label>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
  help,
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue: string;
  help?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary/50"
      />
      {help ? (
        <span className="mt-1 block text-xs text-muted-foreground">{help}</span>
      ) : null}
    </label>
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
    <div className={`rounded-md border px-3 py-2 text-sm ${cls}`} role="status">
      {children}
    </div>
  );
}

/** Check that the env vars + config required by the chosen ticket
 *  destination are actually present. Returns a list of fix-it
 *  suggestions for a banner. Empty list = all good. */
function checkDestinationConfig(
  destination: 'email' | 'slack' | 'linear' | 'zendesk',
  supportEmail: string | null,
): string[] {
  switch (destination) {
    case 'email':
      // Either TICKET_EMAIL_TO or support_email needs to resolve.
      if (!process.env.TICKET_EMAIL_TO && !supportEmail) {
        return [
          'Set Support email above (used as the ticket destination), OR set TICKET_EMAIL_TO in your hosting env vars.',
          'Also set RESEND_API_KEY in env if you haven\u2019t — Resend sends the email.',
        ];
      }
      if (!process.env.RESEND_API_KEY) {
        return [
          'Set RESEND_API_KEY in env (Vercel \u2192 Settings \u2192 Environment Variables). Get a key at resend.com.',
        ];
      }
      return [];
    case 'slack':
      if (!process.env.SLACK_WEBHOOK_URL) {
        return [
          'Set SLACK_WEBHOOK_URL in env. Create one in Slack: Apps \u2192 Incoming Webhooks \u2192 add to channel.',
        ];
      }
      return [];
    case 'linear':
      if (!process.env.LINEAR_API_KEY || !process.env.LINEAR_TEAM_ID) {
        return [
          'Set LINEAR_API_KEY (Linear \u2192 Settings \u2192 API \u2192 Personal API keys) and LINEAR_TEAM_ID (visible in your team\u2019s URL).',
        ];
      }
      return [];
    case 'zendesk':
      if (
        !process.env.ZENDESK_SUBDOMAIN ||
        !process.env.ZENDESK_EMAIL ||
        !process.env.ZENDESK_API_TOKEN
      ) {
        return [
          'Set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN in env.',
        ];
      }
      return [];
  }
}
