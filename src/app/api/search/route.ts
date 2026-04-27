import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { qlaud } from '@/lib/qlaud';
import { getUserRowOrNull } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GET /api/search?q=… — semantic search across the user's threads.
// Scoped to end_user_id so even if multiple Clerk users shared a key
// they couldn't read each other's history.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const user = await getUserRowOrNull(userId);
  if (!user) return NextResponse.json({ data: [] });
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ data: [] });
  const r = await qlaud.search({
    apiKey: user.qlaud_secret,
    query: q,
    endUserId: userId,
    limit: 10,
  });
  return NextResponse.json(r);
}
