import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { qlaud } from '@/lib/qlaud';
import { ensureQlaudState } from '@/lib/user-state';

export const runtime = 'nodejs';

// GET /api/threads/:id — full message history of one thread.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let state;
  try {
    state = await ensureQlaudState(userId);
  } catch (e) {
    return NextResponse.json(
      { error: 'failed to provision', detail: e instanceof Error ? e.message.slice(0, 300) : String(e) },
      { status: 502 },
    );
  }
  const { id } = await params;
  const r = await qlaud.listThreadMessages({
    apiKey: state.qlaud_secret,
    threadId: id,
    limit: 200,
  });
  return NextResponse.json(r);
}
