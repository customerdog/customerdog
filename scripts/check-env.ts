#!/usr/bin/env -S node --env-file=.env.local --import tsx
/**
 * Pre-flight check: verifies the env vars in .env.local are not just
 * present but actually work. Catches "I copied the publishable key into
 * the secret-key slot" before the first request blows up.
 *
 * Usage:
 *   npm run check
 *
 * Exits non-zero if any required check fails. The `predev` hook runs
 * this automatically before `next dev`.
 */

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

type Result = { name: string; ok: boolean; message: string };
const results: Result[] = [];

function pass(name: string, message = 'ok') {
  results.push({ name, ok: true, message });
}
function fail(name: string, message: string) {
  results.push({ name, ok: false, message });
}
function skip(name: string, message: string) {
  results.push({ name, ok: true, message: `${YELLOW}skip${RESET} — ${message}` });
}

async function checkQlaud() {
  const base = process.env.QLAUD_BASE_URL ?? 'https://api.qlaud.ai';
  const key = process.env.QLAUD_KEY;
  if (!key) {
    return fail('qlaud key', 'QLAUD_KEY is not set');
  }
  if (!key.startsWith('qlk_live_') && !key.startsWith('qlk_test_')) {
    return fail(
      'qlaud key',
      'value does not look like a qlaud key (expected qlk_live_… or qlk_test_…)',
    );
  }

  try {
    const r = await fetch(`${base}/v1/tools`, {
      headers: { 'x-api-key': key },
    });
    if (r.status === 401) {
      return fail('qlaud key', 'returned 401 — key is invalid or revoked.');
    }
    if (r.status === 403) {
      return fail(
        'qlaud key',
        'returned 403 — key works but is missing admin scope (needed to register tools). Mint one at qlaud.ai/keys with scope=admin.',
      );
    }
    if (!r.ok) {
      return fail(
        'qlaud key',
        `unexpected ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`,
      );
    }
    const body = (await r.json()) as { data?: unknown[] };
    pass(
      'qlaud key',
      `authenticated; ${body.data?.length ?? 0} tool(s) registered`,
    );
  } catch (e) {
    return fail('qlaud key', `network error to ${base}: ${(e as Error).message}`);
  }
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return fail('supabase url', 'SUPABASE_URL is not set');
  if (!key) return fail('supabase service-role key', 'SUPABASE_SERVICE_ROLE_KEY is not set');
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    return fail('supabase url', `value does not look like a Supabase URL`);
  }

  try {
    // Probe the rest endpoint — needs the service-role key to read.
    const r = await fetch(`${url}/rest/v1/config?select=id&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (r.status === 401 || r.status === 403) {
      return fail(
        'supabase service-role key',
        `returned ${r.status} — key may be wrong or you used the anon key.`,
      );
    }
    if (r.status === 404) {
      return fail(
        'supabase schema',
        `config table not found. Did you run supabase/schema.sql in the SQL Editor?`,
      );
    }
    if (!r.ok) {
      return fail(
        'supabase',
        `unexpected ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`,
      );
    }
    pass('supabase', 'authenticated; schema present');
  } catch (e) {
    return fail('supabase', `network error: ${(e as Error).message}`);
  }
}

function checkAdmin() {
  const pw = process.env.ADMIN_PASSWORD;
  const cs = process.env.ADMIN_COOKIE_SECRET;
  if (!pw) return fail('admin password', 'ADMIN_PASSWORD is not set');
  if (pw.length < 12) {
    return fail(
      'admin password',
      `${pw.length} chars — please use at least 12 (\`openssl rand -base64 32\`)`,
    );
  }
  pass('admin password', `set (${pw.length} chars)`);

  if (!cs) return fail('admin cookie secret', 'ADMIN_COOKIE_SECRET is not set');
  if (cs.length < 24) {
    return fail(
      'admin cookie secret',
      `${cs.length} chars — please use at least 24 (\`openssl rand -base64 32\`)`,
    );
  }
  pass('admin cookie secret', `set (${cs.length} chars)`);
}

function checkOptionalIntegrations() {
  const dest = process.env.TICKET_DESTINATION_DEFAULT;
  if (process.env.RESEND_API_KEY) pass('resend api key', 'set');
  else skip('resend api key', 'send_email tool will fail when called');
  if (dest) pass('ticket destination default', dest);
}

(async () => {
  console.log(`${DIM}Checking env from .env.local…${RESET}\n`);
  await checkQlaud();
  await checkSupabase();
  checkAdmin();
  checkOptionalIntegrations();

  for (const r of results) {
    const icon = r.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon} ${r.name.padEnd(30)} ${DIM}${r.message}${RESET}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log();
  if (failed.length === 0) {
    console.log(`${GREEN}all good — you're ready to run \`npm run dev\`.${RESET}`);
  } else {
    console.log(
      `${RED}${failed.length} check${failed.length === 1 ? '' : 's'} failed${RESET} — fix the items above, then re-run \`npm run check\`.`,
    );
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
