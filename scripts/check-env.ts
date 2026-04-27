#!/usr/bin/env -S node --env-file=.env.local --import tsx
/**
 * Pre-flight check: verifies the env vars in .env.local are not just
 * present but actually work. Catches "I copied the publishable key into
 * the service-role slot" before the first user signup blows up.
 *
 * Usage:
 *   pnpm run check
 *
 * Exits non-zero if any required check fails.
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

async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) return fail('Supabase URL', 'NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
    return fail(
      'Supabase URL',
      `value "${url}" does not look like a Supabase project URL`,
    );
  }
  pass('Supabase URL', url);

  if (!anon) {
    fail('Supabase anon key', 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  } else if (!anon.startsWith('sb_publishable_') && !anon.startsWith('eyJ')) {
    fail(
      'Supabase anon key',
      'value does not look like an anon key (expected sb_publishable_… or a JWT starting with eyJ)',
    );
  } else {
    pass('Supabase anon key', `${anon.slice(0, 20)}…`);
  }

  if (!serviceRole) {
    return fail(
      'Supabase service-role key',
      'SUPABASE_SERVICE_ROLE_KEY is not set — Clerk webhook cannot insert users without it. Get it from Settings → API → "service_role".',
    );
  }
  if (serviceRole === anon) {
    return fail(
      'Supabase service-role key',
      'service-role key is the SAME as the anon key — paste the "service_role" / "sb_secret_…" value, not the publishable one.',
    );
  }

  // Live probe: try a one-row select against `users` (works whether the
  // table has rows or not — RLS is bypassed by service-role).
  try {
    const r = await fetch(`${url}/rest/v1/users?select=clerk_user_id&limit=1`, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });
    if (r.status === 401) {
      return fail(
        'Supabase service-role key',
        'returned 401 Unauthorized — the key is invalid or revoked.',
      );
    }
    if (r.status === 404 || r.status === 400) {
      const text = await r.text().catch(() => '');
      if (text.includes('does not exist') || text.includes('schema cache')) {
        return fail(
          'Supabase users table',
          'connection works but `users` table is missing — run `pnpm run db:push` to apply migrations.',
        );
      }
    }
    if (!r.ok) {
      return fail(
        'Supabase service-role key',
        `unexpected ${r.status} from REST API: ${(await r.text().catch(() => '')).slice(0, 200)}`,
      );
    }
    pass('Supabase service-role key', 'authenticated + users table reachable');
  } catch (e) {
    return fail('Supabase service-role key', `network error: ${(e as Error).message}`);
  }
}

async function checkQlaud() {
  const base = process.env.QLAUD_BASE_URL ?? 'https://api.qlaud.ai';
  const master = process.env.QLAUD_MASTER_KEY;
  if (!master) {
    return fail('qlaud master key', 'QLAUD_MASTER_KEY is not set');
  }
  if (!master.startsWith('qlk_live_') && !master.startsWith('qlk_test_')) {
    return fail(
      'qlaud master key',
      'value does not look like a qlaud key (expected qlk_live_… or qlk_test_…)',
    );
  }

  try {
    const r = await fetch(`${base}/v1/tools`, {
      headers: { 'x-api-key': master },
    });
    if (r.status === 401) {
      return fail(
        'qlaud master key',
        'returned 401 — key is invalid, revoked, or not master-scoped.',
      );
    }
    if (r.status === 403) {
      return fail(
        'qlaud master key',
        'returned 403 — key works but is missing master scope. Mint one at console.qlaud.ai/keys with scope=admin.',
      );
    }
    if (!r.ok) {
      return fail(
        'qlaud master key',
        `unexpected ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`,
      );
    }
    const body = (await r.json()) as { data?: unknown[] };
    pass(
      'qlaud master key',
      `authenticated; ${body.data?.length ?? 0} tool(s) registered`,
    );
  } catch (e) {
    return fail('qlaud master key', `network error to ${base}: ${(e as Error).message}`);
  }
}

function checkClerk() {
  const pub = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sec = process.env.CLERK_SECRET_KEY;
  const wh = process.env.CLERK_WEBHOOK_SECRET;

  if (!pub) {
    fail(
      'Clerk publishable key',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set — get it from dashboard.clerk.com → API Keys.',
    );
  } else if (!pub.startsWith('pk_test_') && !pub.startsWith('pk_live_')) {
    fail('Clerk publishable key', 'value does not look like a Clerk publishable key');
  } else {
    pass('Clerk publishable key', pub.slice(0, 16) + '…');
  }

  if (!sec) {
    fail('Clerk secret key', 'CLERK_SECRET_KEY is not set');
  } else if (!sec.startsWith('sk_test_') && !sec.startsWith('sk_live_')) {
    fail('Clerk secret key', 'value does not look like a Clerk secret key');
  } else {
    pass('Clerk secret key', sec.slice(0, 16) + '…');
  }

  if (!wh) {
    skip(
      'Clerk webhook secret',
      'set after you create a Webhooks endpoint pointing at /api/webhooks/clerk',
    );
  } else if (!wh.startsWith('whsec_')) {
    fail('Clerk webhook secret', 'value does not start with whsec_');
  } else {
    pass('Clerk webhook secret', 'whsec_…');
  }
}

(async () => {
  console.log(`${DIM}Checking env from .env.local…${RESET}\n`);
  await checkSupabase();
  await checkQlaud();
  checkClerk();

  for (const r of results) {
    const icon = r.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon} ${r.name.padEnd(30)} ${DIM}${r.message}${RESET}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log();
  if (failed.length === 0) {
    console.log(`${GREEN}all good — you're ready to run \`pnpm dev\`.${RESET}`);
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
