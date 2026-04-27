import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { qlaud } from '@/lib/qlaud';
import { ensureQlaudState } from '@/lib/user-state';

export const runtime = 'nodejs';

// GET /api/search?q=… — semantic search across the user's threads.
// Scoped to end_user_id so even if multiple Clerk users shared a key
// they couldn't read each other's history.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let state;
  try {
    state = await ensureQlaudState(userId);
  } catch {
    return NextResponse.json({ data: [] });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ data: [] });
  const r = await qlaud.search({
    apiKey: state.qlaud_secret,
    query: q,
    endUserId: userId,
    limit: 10,
  });
  return NextResponse.json(r);
}
