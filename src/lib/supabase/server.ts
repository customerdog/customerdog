import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

// Server-side Supabase client. Uses the service-role key — bypasses RLS,
// so ONLY import from server components, route handlers, and webhooks.
// Never re-export to client bundles.

let cached: ReturnType<typeof createClient> | null = null;

export function getServerSupabase() {
  if (cached) return cached;
  cached = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

// ─── Domain helpers ─────────────────────────────────────────────────────────

export type UserRow = {
  clerk_user_id: string;
  email: string;
  qlaud_key_id: string;
  qlaud_secret: string;
  qlaud_initial_thread_id: string;
  created_at: string;
};

export async function getUserRowOrNull(
  clerkUserId: string,
): Promise<UserRow | null> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('users')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle();
  if (error) {
    console.error('getUserRowOrNull failed', error);
    return null;
  }
  return (data as UserRow | null) ?? null;
}

export async function insertUserRow(row: Omit<UserRow, 'created_at'>) {
  const sb = getServerSupabase();
  const { error } = await sb.from('users').insert(row as never);
  if (error) throw error;
}
