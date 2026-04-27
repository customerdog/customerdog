import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { verifyToolWebhook } from '@/lib/tools/verify-signature';

export const runtime = 'nodejs';

const Input = z.object({
  prompt: z.string().min(1).max(2000),
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(),
});

// POST /api/tools/generate-image — qlaud → us, signed.
//
// Demo implementation uses pollinations.ai, which is free and keyless.
// In real apps you'd swap in OpenAI Images, Replicate, or your own
// model server.
export async function POST(req: Request) {
  const secret = env.QLAUD_TOOL_SECRET_GENERATE_IMAGE();
  if (!secret) {
    return NextResponse.json(
      { output: 'generate_image tool not configured', is_error: true },
      { status: 200 },
    );
  }
  const raw = await req.text();
  if (!verifyToolWebhook(req.headers, raw, secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  const body = JSON.parse(raw) as { input?: unknown };
  const parsed = Input.safeParse(body.input ?? {});
  if (!parsed.success) {
    return NextResponse.json({
      output: `bad input: ${parsed.error.message}`,
      is_error: true,
    });
  }
  const { prompt, size = '1024x1024' } = parsed.data;
  const [w, h] = size.split('x');

  const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set('width', w);
  url.searchParams.set('height', h);
  url.searchParams.set('nologo', 'true');

  return NextResponse.json({
    output: {
      prompt,
      size,
      url: url.toString(),
      markdown: `![${prompt.slice(0, 60)}](${url.toString()})`,
    },
  });
}
