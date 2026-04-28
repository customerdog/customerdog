import 'server-only';
import { env } from '../env';

/**
 * Email destination — sends a ticket via Resend to the configured
 * support inbox (TICKET_EMAIL_TO). Also used by the send_email_to_user
 * tool to email the visitor directly.
 *
 * Resend API: https://resend.com/docs/api-reference/emails/send-email
 */

export type EmailSendArgs = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  from?: string;
};

export type EmailSendResult = { id: string };

const RESEND_API = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'customerdog <onboarding@resend.dev>';

export async function sendEmail(args: EmailSendArgs): Promise<EmailSendResult> {
  const apiKey = env.RESEND_API_KEY();
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set — cannot send email. Add it to env.',
    );
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: args.from ?? DEFAULT_FROM,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      reply_to: args.replyTo,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as { id: string };
  return { id: body.id };
}
