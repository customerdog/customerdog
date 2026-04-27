import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { qlaud } from '@/lib/qlaud';
import { ensureQlaudState } from '@/lib/user-state';

export const runtime = 'nodejs';

// GET /api/threads — list the current user's threads (newest first).
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let state;
  try {
    state = await ensureQlaudState(userId);
  } catch {
    return NextResponse.json({ data: [] });
  }
  const r = await qlaud.listThreads({
    apiKey: state.qlaud_secret,
    endUserId: userId,
    limit: 50,
  });
  return NextResponse.json(r);
}

// POST /api/threads — create a new empty thread.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let state;
  try {
    state = await ensureQlaudState(userId);
  } catch (e) {
    return NextResponse.json(
      {
        error: 'failed to provision qlaud account',
        detail: e instanceof Error ? e.message.slice(0, 300) : String(e),
      },
      { status: 502 },
    );
  }
  const t = await qlaud.createThread({
    apiKey: state.qlaud_secret,
    endUserId: userId,
  });
  return NextResponse.json(t);
}
