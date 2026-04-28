import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToolWebhook } from '@/lib/tools/verify-signature';
import { sendEmail } from '@/lib/destinations/email';
import { findConversationByThread, logAction } from '@/lib/activity';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * send_email_to_user tool webhook. The AI calls this to send a follow-
 * up email to the visitor (e.g., a fresh password reset link, a copy
 * of the resolution).
 *
 * Safety: zod-validates the email format. Logs every send to the
 * actions table so admin can audit.
 */

const inputSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(250),
  body: z.string().min(1).max(20_000),
});

type WebhookBody = {
  tool_id: string;
  tool_use_id: string;
  name: string;
  input: unknown;
  thread_id: string;
  end_user_id?: string | null;
};

export async function POST(req: Request) {
  const secret = env.QLAUD_TOOL_SECRET_SEND_EMAIL();
  if (!secret) {
    return NextResponse.json(
      { error: 'tool_not_registered' },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  if (!verifyToolWebhook(req.headers, rawBody, secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  let payload: WebhookBody;
  try {
    payload = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(payload.input);
  if (!parsed.success) {
    return NextResponse.json({
      output: `Email input invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}.`,
      is_error: true,
    });
  }
  const input = parsed.data;

  let resultId: string;
  try {
    const r = await sendEmail({
      to: input.to,
      subject: input.subject,
      text: input.body,
    });
    resultId = r.id;
  } catch (e) {
    return NextResponse.json({
      output: `Failed to send email: ${(e as Error).message}.`,
      is_error: true,
    });
  }

  // Log + return a confirmation the model can relay.
  const conversation = await findConversationByThread(payload.thread_id);
  void logAction({
    conversationId: conversation?.id ?? null,
    type: 'email_sent',
    payload: {
      to: input.to,
      subject: input.subject,
      resend_id: resultId,
    },
  });

  return NextResponse.json({
    output: `Email sent to ${input.to} (subject: ${input.subject}). Tell the visitor it's on its way.`,
  });
}
