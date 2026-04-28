import 'server-only';
import { cookies } from 'next/headers';

/**
 * Anonymous visitor session — purely cookie-based, no auth, no DB row
 * required just to start chatting.
 *
 * Two cookies:
 *   cd_visitor   — opaque visitor id (anon_<uuid>). 1-year max-age.
 *                  Used as qlaud's `end_user_id` on the thread so the
 *                  same visitor's threads stay correlated even though
 *                  qlaud doesn't know who they are.
 *   cd_thread    — current qlaud thread id for this visitor's session.
 *                  30-day max-age. Cleared if visitor wants a fresh
 *                  conversation.
 *
 * Both are HttpOnly + SameSite=Lax + Secure-in-prod. Visitors can't
 * meaningfully tamper: stealing someone's cd_thread only lets you read
 * what they read; there's no escalation path because conversations
 * carry no auth state of their own.
 */

const VISITOR_COOKIE = 'cd_visitor';
const THREAD_COOKIE = 'cd_thread';
const VISITOR_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 year
const THREAD_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

const baseOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

export async function getOrCreateVisitorId(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(VISITOR_COOKIE)?.value;
  if (!id) {
    id = `anon_${crypto.randomUUID()}`;
    jar.set(VISITOR_COOKIE, id, { ...baseOptions(), maxAge: VISITOR_MAX_AGE_S });
  }
  return id;
}

export async function getThreadId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(THREAD_COOKIE)?.value ?? null;
}

export async function setThreadId(threadId: string): Promise<void> {
  const jar = await cookies();
  jar.set(THREAD_COOKIE, threadId, { ...baseOptions(), maxAge: THREAD_MAX_AGE_S });
}

export async function clearThreadId(): Promise<void> {
  const jar = await cookies();
  jar.delete(THREAD_COOKIE);
}

export const COOKIE_NAMES = {
  VISITOR: VISITOR_COOKIE,
  THREAD: THREAD_COOKIE,
};
