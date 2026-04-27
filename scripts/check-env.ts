#!/usr/bin/env -S node --env-file=.env.local --import tsx
/**
 * Pre-flight check: verifies the env vars in .env.local are not just
 * present but actually work. Catches "I copied the publishable key into
 * the secret-key slot" before the first user signup blows up.
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

async function checkClerk() {
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
    return fail('Clerk secret key', 'CLERK_SECRET_KEY is not set');
  }
  if (!sec.startsWith('sk_test_') && !sec.startsWith('sk_live_')) {
    return fail('Clerk secret key', 'value does not look like a Clerk secret key');
  }

  // Live probe: hit the Clerk backend API. The /v1/users endpoint
  // requires a valid secret key; 401 means a wrong/revoked key.
  try {
    const r = await fetch('https://api.clerk.com/v1/users?limit=1', {
      headers: { Authorization: `Bearer ${sec}` },
    });
    if (r.status === 401) {
      return fail(
        'Clerk secret key',
        'returned 401 — key is invalid or revoked.',
      );
    }
    if (!r.ok) {
      return fail(
        'Clerk secret key',
        `unexpected ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`,
      );
    }
    pass('Clerk secret key', 'authenticated against api.clerk.com');
  } catch (e) {
    return fail('Clerk secret key', `network error: ${(e as Error).message}`);
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

(async () => {
  console.log(`${DIM}Checking env from .env.local…${RESET}\n`);
  await checkClerk();
  await checkQlaud();

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
