import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { env } from '@/lib/env';
import { qlaud } from '@/lib/qlaud';
import { getQlaudState, setQlaudState } from '@/lib/user-state';

export const runtime = 'nodejs';

// POST /api/webhooks/clerk
//
// Clerk sends `user.created` here, signed with svix. We use it to
// provision the new user's qlaud footprint:
//   1. Mint a per-user qlk_live_… key with a hard $5/mo cap.
//   2. Create their first thread, tagged with the Clerk user id as
//      end_user_id (so /v1/search?end_user_id=… works).
//   3. Persist the qlaud key + initial thread id into the user's
//      Clerk privateMetadata.
//
// Idempotent: re-delivery of the same event is a no-op (we check for
// existing privateMetadata first). Safe to wire as a Clerk webhook
// with retries.

const DEFAULT_BUDGET_USD = Number(process.env.NEW_USER_BUDGET_USD ?? '5');

export async function POST(req: Request) {
  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET());
  const body = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  let evt: { type: string; data: Record<string, unknown> };
  try {
    evt = wh.verify(body, headers as never) as typeof evt;
  } catch {
    return NextResponse.json({ error: 'invalid svix signature' }, { status: 400 });
  }

  if (evt.type !== 'user.created') {
    return NextResponse.json({ ok: true, ignored: evt.type });
  }

  const data = evt.data as { id: string };
  const clerkUserId = data.id;

  // Idempotency — if Clerk redelivers the same user.created we shouldn't
  // mint a second key.
  const existing = await getQlaudState(clerkUserId).catch(() => null);
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Each step has its own try/catch so the reply (visible in Clerk's
  // delivery dashboard) names the failing service + a hint.
  let key: Awaited<ReturnType<typeof qlaud.mintKey>>;
  try {
    key = await qlaud.mintKey({
      name: `chatai:${clerkUserId}`,
      scope: 'standard',
      maxSpendUsd: DEFAULT_BUDGET_USD,
    });
  } catch (e) {
    return failWith('qlaud.mintKey', e, 'QLAUD_MASTER_KEY may be invalid or revoked.');
  }

  let thread: Awaited<ReturnType<typeof qlaud.createThread>>;
  try {
    thread = await qlaud.createThread({
      apiKey: key.secret,
      endUserId: clerkUserId,
      metadata: { source: 'chatai-signup' },
    });
  } catch (e) {
    return failWith('qlaud.createThread', e);
  }

  try {
    await setQlaudState(clerkUserId, {
      qlaud_key_id: key.id,
      qlaud_secret: key.secret,
      qlaud_initial_thread_id: thread.id,
    });
  } catch (e) {
    return failWith(
      'clerk.updateUserMetadata',
      e,
      'CLERK_SECRET_KEY may be missing or wrong.',
    );
  }

  return NextResponse.json({
    ok: true,
    qlaud_key_id: key.id,
    qlaud_initial_thread_id: thread.id,
  });
}

function failWith(step: string, e: unknown, hint?: string) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[clerk-webhook] ${step} failed:`, message);
  return NextResponse.json(
    {
      error: `${step} failed`,
      detail: message.slice(0, 500),
      ...(hint ? { hint } : {}),
    },
    { status: 502 },
  );
}
