import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import { qlaud } from './qlaud';

// Where we keep each user's qlaud footprint. Lives in Clerk's
// privateMetadata — server-only, ~8KB per user limit (we use ~200 bytes).
//
// SECURITY: this module is server-only. The qlaud_secret it returns
// grants access to the user's per-user key — anyone with it can spend
// against their cap. Never return it to the browser; route handlers
// that use it must call qlaud server-side and proxy results.
//
// Why not Supabase: with this much data per user, paying for a separate
// database (and the SDK + migrations + RLS policies that come with it)
// is overkill. Clerk already knows about every user; we're just bolting
// three extra fields onto the existing record.
//
// One round-trip per request to api.clerk.com on cold cache, served
// from in-memory cache for the next 60 seconds. The state changes
// once, at signup, so the cache is effectively forever.

export type QlaudUserState = {
  qlaud_key_id: string;
  qlaud_secret: string;
  qlaud_initial_thread_id: string;
};

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { state: QlaudUserState; loadedAt: number }>();

export async function getQlaudState(
  clerkUserId: string,
): Promise<QlaudUserState | null> {
  const hit = cache.get(clerkUserId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.state;

  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const md = (user.privateMetadata ?? {}) as Partial<QlaudUserState>;

  if (!md.qlaud_secret || !md.qlaud_key_id || !md.qlaud_initial_thread_id) {
    return null;
  }
  const state: QlaudUserState = {
    qlaud_key_id: md.qlaud_key_id,
    qlaud_secret: md.qlaud_secret,
    qlaud_initial_thread_id: md.qlaud_initial_thread_id,
  };
  cache.set(clerkUserId, { state, loadedAt: Date.now() });
  return state;
}

export async function setQlaudState(
  clerkUserId: string,
  state: QlaudUserState,
): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, {
    privateMetadata: state as unknown as Record<string, unknown>,
  });
  cache.set(clerkUserId, { state, loadedAt: Date.now() });
}

// Per-process dedup of in-flight provisioning attempts. Two requests
// for the same brand-new user (e.g. quick refresh, multiple tabs) will
// share a single mintKey + createThread roundtrip rather than racing.
// Cross-instance races are still possible (different Vercel lambdas
// for the same user); the loser ends up with an orphaned key, but it
// has no holder so it can't be spent. Cheap to tolerate vs. the cost
// of a distributed lock.
const provisioning = new Map<string, Promise<QlaudUserState>>();

/**
 * Returns the user's qlaud state, provisioning it inline if Clerk's
 * privateMetadata is empty. Use this on every read path the user
 * actually depends on (chat pages, /api/chat, /api/threads, etc.) —
 * the webhook becomes an optimization that warms the cache before
 * the user ever loads /chat, not a load-bearing dependency.
 *
 * Throws on qlaud or Clerk failure. Callers should catch and render
 * a friendly retry screen.
 */
export async function ensureQlaudState(
  clerkUserId: string,
): Promise<QlaudUserState> {
  const existing = await getQlaudState(clerkUserId);
  if (existing) return existing;

  const inflight = provisioning.get(clerkUserId);
  if (inflight) return inflight;

  const promise = provisionInline(clerkUserId).finally(() => {
    provisioning.delete(clerkUserId);
  });
  provisioning.set(clerkUserId, promise);
  return promise;
}

async function provisionInline(clerkUserId: string): Promise<QlaudUserState> {
  // Re-check inside the dedup gate — the webhook may have landed
  // between the outer fast-path check and us acquiring the slot.
  const existing = await getQlaudState(clerkUserId);
  if (existing) return existing;

  const budget = Number(process.env.NEW_USER_BUDGET_USD ?? '5');
  const key = await qlaud.mintKey({
    name: `chatai:${clerkUserId}`,
    scope: 'standard',
    maxSpendUsd: budget,
  });
  const thread = await qlaud.createThread({
    apiKey: key.secret,
    endUserId: clerkUserId,
    metadata: { source: 'chatai-lazy' },
  });
  const state: QlaudUserState = {
    qlaud_key_id: key.id,
    qlaud_secret: key.secret,
    qlaud_initial_thread_id: thread.id,
  };
  await setQlaudState(clerkUserId, state);
  return state;
}
