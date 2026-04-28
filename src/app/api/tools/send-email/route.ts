import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToolWebhook } from '@/lib/tools/verify-signature';
import { sendEmail } from '@/lib/destinations/email';
import { findConversationByThread, logAction } from '@/lib/activity';
import { getConfig } from '@/lib/supabase';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * send_email_to_user tool webhook.
 *
 * Locked-down semantics (vs. an AI-controlled to-address):
 *
 *   • TO: the deploying company's support address (config.support_email,
 *         falling back to env TICKET_EMAIL_TO). The AI cannot redirect
 *         the email anywhere else — eliminates the prompt-injection
 *         attack where a visitor convinces the AI to spam a third party.
 *   • BCC: the visitor's collected email (conversations.contact_email).
 *         Gives the visitor a copy of every send so they have a record.
 *   • FROM: Resend's default sender (operator can configure their own
 *         verified domain in Resend; we don't override per-call).
 *
 * The AI controls only `subject` and `body`. We log every send to the
 * actions table so admin can audit.
 */

const inputSchema = z.object({
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

  // Resolve recipients server-side. The AI doesn't get to set them.
  const [config, conversation] = await Promise.all([
    getConfig().catch(() => null),
    findConversationByThread(payload.thread_id),
  ]);

  const to = config?.support_email || env.TICKET_EMAIL_TO();
  if (!to) {
    return NextResponse.json({
      output:
        "I can't send this email — no support address is configured. Tell the visitor we'll follow up another way and call create_ticket instead.",
      is_error: true,
    });
  }

  const bcc = conversation?.contact_email ?? null;
  if (!bcc) {
    return NextResponse.json({
      output:
        "I can't send this email yet — I haven't collected the visitor's email address. Ask the visitor for their email so I can include them on the message, then call this tool again.",
      is_error: true,
    });
  }

  let resultId: string;
  try {
    const r = await sendEmail({
      to,
      bcc,
      subject: input.subject,
      text: input.body,
      replyTo: bcc, // Replies go back to the visitor, not back to support.
    });
    resultId = r.id;
  } catch (e) {
    return NextResponse.json({
      output: `Failed to send email: ${(e as Error).message}.`,
      is_error: true,
    });
  }

  void logAction({
    conversationId: conversation?.id ?? null,
    type: 'email_sent',
    payload: {
      to,
      bcc,
      subject: input.subject,
      resend_id: resultId,
    },
  });

  return NextResponse.json({
    output: `Email sent to support (${to}) with the visitor BCC'd at ${bcc}. Tell the visitor we've sent the recap to their inbox and our team has it on file.`,
  });
}
