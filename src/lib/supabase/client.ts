'use client';

import { createClient } from '@supabase/supabase-js';

// Browser-side Supabase client — uses the anon key, bound by RLS. Used
// for any client-component reads (e.g. listing the user's own files).

let cached: ReturnType<typeof createClient> | null = null;

export function getBrowserSupabase() {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
