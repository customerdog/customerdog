import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { verifyToolWebhook } from '@/lib/tools/verify-signature';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Input = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),
});

// POST /api/tools/save-to-drive — qlaud → us, signed.
//
// Persists a snippet to a `drive_items` table in Supabase, scoped to
// the end_user_id qlaud forwards in the webhook payload. Surfaces the
// row id back to the assistant so it can reference it in subsequent
// turns.
export async function POST(req: Request) {
  const secret = env.QLAUD_TOOL_SECRET_SAVE_TO_DRIVE();
  if (!secret) {
    return NextResponse.json(
      { output: 'save_to_drive tool not configured', is_error: true },
      { status: 200 },
    );
  }
  const raw = await req.text();
  if (!verifyToolWebhook(req.headers, raw, secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  const body = JSON.parse(raw) as {
    input?: unknown;
    thread_id?: string;
    end_user_id?: string;
  };
  const parsed = Input.safeParse(body.input ?? {});
  if (!parsed.success) {
    return NextResponse.json({
      output: `bad input: ${parsed.error.message}`,
      is_error: true,
    });
  }

  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('drive_items')
    .insert({
      clerk_user_id: body.end_user_id ?? null,
      thread_id: body.thread_id ?? null,
      title: parsed.data.title,
      content: parsed.data.content,
    } as never)
    .select('id, created_at')
    .single<{ id: string; created_at: string }>();

  if (error) {
    return NextResponse.json({ output: `save failed: ${error.message}`, is_error: true });
  }

  return NextResponse.json({
    output: {
      id: data.id,
      title: parsed.data.title,
      saved_at: data.created_at,
    },
  });
}
