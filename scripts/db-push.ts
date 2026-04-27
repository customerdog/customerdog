#!/usr/bin/env -S node --env-file=.env.local --import tsx
/**
 * Apply Supabase migrations from supabase/migrations/*.sql.
 *
 * Usage:
 *   pnpm run db:push
 *
 * Idempotent: tracks applied filenames in a `_chatai_migrations` table
 * so re-runs only apply new files. Each migration runs in a transaction;
 * a failure rolls that file back, leaving the previous state intact.
 *
 * Connection: builds a direct-postgres URL from NEXT_PUBLIC_SUPABASE_URL
 * (project ref) + SUPABASE_DB_PASSWORD (from your Supabase dashboard,
 * Settings → Database → Connection string).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

function fail(msg: string): never {
  console.error(`${RED}✗${RESET} ${msg}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!supabaseUrl) {
  fail(
    'NEXT_PUBLIC_SUPABASE_URL is not set in .env.local — copy from .env.example and fill in your Supabase project URL.',
  );
}
if (!dbPassword) {
  fail(
    'SUPABASE_DB_PASSWORD is not set in .env.local. Find it in Supabase dashboard → Project Settings → Database → "Database password" (reset if you forgot it).',
  );
}

const match = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/);
if (!match) {
  fail(
    `NEXT_PUBLIC_SUPABASE_URL ("${supabaseUrl}") does not look like a Supabase project URL — expected https://<ref>.supabase.co`,
  );
}
const projectRef = match[1];

// Direct connection (port 5432) is required for DDL — the pooler on
// 6543 is transaction-mode and can't run CREATE TABLE in a transaction
// reliably across statements.
const connectionString = `postgresql://postgres:${encodeURIComponent(
  dbPassword,
)}@db.${projectRef}.supabase.co:5432/postgres`;

// Encrypted in transit but skip cert-chain validation. Supabase's CA
// is fine but pg's verify-full mode requires the full chain bundled,
// which adds a dependency for a one-shot migration script.
const ssl = { rejectUnauthorized: false };

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

async function main() {
  let files: string[];
  try {
    files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch (e) {
    fail(`could not read ${MIGRATIONS_DIR}: ${(e as Error).message}`);
  }

  if (files.length === 0) {
    console.log(`${YELLOW}!${RESET} no migrations found in supabase/migrations/`);
    return;
  }

  const client = new Client({ connectionString, ssl });
  try {
    await client.connect();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('password authentication failed')) {
      fail(
        'password authentication failed — SUPABASE_DB_PASSWORD in .env.local is wrong. Reset it in Supabase dashboard → Settings → Database.',
      );
    }
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      fail(
        `could not resolve db.${projectRef}.supabase.co — check that NEXT_PUBLIC_SUPABASE_URL is correct.`,
      );
    }
    fail(`postgres connect failed: ${msg}`);
  }

  console.log(`${DIM}connected to db.${projectRef}.supabase.co${RESET}`);

  await client.query(
    `create table if not exists _chatai_migrations (
       name text primary key,
       applied_at timestamptz default now()
     )`,
  );
  const { rows } = await client.query<{ name: string }>(
    'select name from _chatai_migrations',
  );
  const applied = new Set(rows.map((r) => r.name));

  let newCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`${DIM}  · ${file} (already applied)${RESET}`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  → applying ${file} … `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _chatai_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`${GREEN}ok${RESET}`);
      newCount++;
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.log(`${RED}failed${RESET}`);
      console.error(`${RED}  ${(e as Error).message}${RESET}`);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  if (newCount === 0) {
    console.log(`${GREEN}✓${RESET} schema up to date — no new migrations to apply.`);
  } else {
    console.log(
      `${GREEN}✓${RESET} applied ${newCount} migration${newCount === 1 ? '' : 's'}.`,
    );
  }

  // Independent verification through PostgREST — proves the migration
  // landed in a way the runtime can actually see (schema cache reload,
  // RLS policies in place, etc.). If the SQL ran but PostgREST hasn't
  // refreshed yet, this catches it.
  await verifyViaRest();
}

async function verifyViaRest() {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    console.log(
      `${YELLOW}!${RESET} SUPABASE_SERVICE_ROLE_KEY not set — skipping REST verification.`,
    );
    return;
  }
  const tables = ['users', 'drive_items'];
  let allOk = true;
  for (const table of tables) {
    try {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/${table}?select=*&limit=0`,
        {
          headers: {
            apikey: serviceRole,
            Authorization: `Bearer ${serviceRole}`,
          },
        },
      );
      if (r.ok) {
        console.log(`${GREEN}✓${RESET} REST: ${table} reachable`);
      } else {
        const body = (await r.text().catch(() => '')).slice(0, 200);
        console.log(`${RED}✗${RESET} REST: ${table} → ${r.status} ${body}`);
        allOk = false;
      }
    } catch (e) {
      console.log(`${RED}✗${RESET} REST: ${table} → network error: ${(e as Error).message}`);
      allOk = false;
    }
  }
  if (!allOk) {
    console.log(
      `${YELLOW}!${RESET} migration ran but REST cannot see all tables yet. Wait ~10s for the schema cache to refresh, then retry — or check Supabase dashboard → Database → Tables.`,
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
