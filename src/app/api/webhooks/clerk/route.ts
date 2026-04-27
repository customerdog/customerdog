import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { env } from '@/lib/env';
import { qlaud } from '@/lib/qlaud';
import { getServerSupabase, insertUserRow } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// POST /api/webhooks/clerk
//
// Clerk sends `user.created` (and other events) here, signed with svix.
// We use the user.created event to provision the new user's qlaud
// footprint:
//   1. Mint a per-user qlk_live_… key with a hard $5/mo cap (configurable
//      via WELCOME_BUDGET env if you want).
//   2. Create their first thread, tagged with the Clerk user id as
//      end_user_id (so /v1/search?end_user_id=… works).
//   3. Store everything in Supabase users.
//
// Idempotent: re-delivery of the same event is a no-op (we check for an
// existing row first). Safe to wire as a Clerk webhook with retries.

const DEFAULT_BUDGET_USD = Number(process.env.NEW_USER_BUDGET_USD ?? '5');

export async function POST(req: Request) {
  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET());
  const body = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  let evt: { type: string; data: Record<string, unknown> };
  try {
    evt = wh.verify(body, headers as never) as typeof evt;
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid svix signature' },
      { status: 400 },
    );
  }

  if (evt.type !== 'user.created') {
    // Acknowledge anything else without doing work — keeps Clerk happy
    // even when our event-type filter is broader than we need.
    return NextResponse.json({ ok: true, ignored: evt.type });
  }

  const data = evt.data as {
    id: string;
    email_addresses?: Array<{ email_address?: string }>;
  };
  const clerkUserId = data.id;
  const email = data.email_addresses?.[0]?.email_address ?? '';

  // Idempotency — if Clerk redelivers the same user.created we shouldn't
  // mint a second key.
  const sb = getServerSupabase();
  const existing = await sb
    .from('users')
    .select('clerk_user_id')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle();
  if (existing.data) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // 1. Mint the per-user qlaud key.
  const key = await qlaud.mintKey({
    name: `chatai:${clerkUserId}`,
    scope: 'standard',
    maxSpendUsd: DEFAULT_BUDGET_USD,
  });

  // 2. Create their first thread.
  const thread = await qlaud.createThread({
    apiKey: key.secret,
    endUserId: clerkUserId,
    metadata: { source: 'chatai-signup' },
  });

  // 3. Persist the link.
  await insertUserRow({
    clerk_user_id: clerkUserId,
    email,
    qlaud_key_id: key.id,
    qlaud_secret: key.secret,
    qlaud_initial_thread_id: thread.id,
  });

  return NextResponse.json({
    ok: true,
    qlaud_key_id: key.id,
    qlaud_initial_thread_id: thread.id,
  });
}
