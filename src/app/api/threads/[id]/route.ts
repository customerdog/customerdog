import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { qlaud } from '@/lib/qlaud';
import { getUserRowOrNull } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GET /api/threads/:id — full message history of one thread.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const user = await getUserRowOrNull(userId);
  if (!user) return NextResponse.json({ error: 'not provisioned' }, { status: 425 });
  const { id } = await params;
  const r = await qlaud.listThreadMessages({
    apiKey: user.qlaud_secret,
    threadId: id,
    limit: 200,
  });
  return NextResponse.json(r);
}
