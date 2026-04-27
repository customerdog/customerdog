import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { qlaud } from '@/lib/qlaud';
import { getUserRowOrNull } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GET /api/threads — list the current user's threads (newest first).
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const user = await getUserRowOrNull(userId);
  if (!user) return NextResponse.json({ data: [] });
  const r = await qlaud.listThreads({
    apiKey: user.qlaud_secret,
    endUserId: userId,
    limit: 50,
  });
  return NextResponse.json(r);
}

// POST /api/threads — create a new empty thread.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const user = await getUserRowOrNull(userId);
  if (!user) return NextResponse.json({ error: 'not provisioned' }, { status: 425 });
  const t = await qlaud.createThread({
    apiKey: user.qlaud_secret,
    endUserId: userId,
  });
  return NextResponse.json(t);
}
