import Link from 'next/link';
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
  const sp = await searchParams;
  const cfg = await getConfig();

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
