import 'server-only';
import { sendEmail } from './email';
import { sendToSlack } from './slack';
import { sendToLinear } from './linear';
import { sendToZendesk } from './zendesk';
import { env } from '../env';
import type { TicketArgs, TicketResult } from './types';

/** Dispatch a ticket to the destination configured in Supabase
 *  config.ticket_destination. Throws if the chosen destination's env
 *  vars aren't set; the chat handler catches and returns is_error=true. */
export async function sendTicket(
  destination: 'email' | 'slack' | 'linear' | 'zendesk',
  args: TicketArgs,
): Promise<TicketResult> {
  switch (destination) {
    case 'email': {
      // Prefer explicit env override, fall back to config.support_email
      // (passed by the route handler). Operators who already set
      // support_email in /admin/settings don't need a second env var.
      const to = env.TICKET_EMAIL_TO() ?? args.fallbackEmail ?? null;
      if (!to) {
        throw new Error(
          'No ticket email address configured. Set support_email in /admin/settings (or TICKET_EMAIL_TO in env) to enable email tickets.',
        );
      }
      const replyTo = args.contact.email ?? undefined;
      await sendEmail({
        to,
        subject: `[${args.priority}] ${args.summary}`.slice(0, 250),
        text: [
          args.details,
          '',
          '---',
          `Visitor contact: ${[args.contact.email, args.contact.phone].filter(Boolean).join(' / ') || 'none'}`,
          `Visitor id: ${args.visitorId}`,
          `Conversation thread: ${args.threadId}`,
        ].join('\n'),
        replyTo,
      });
      return { resultUrl: null };
    }
    case 'slack':
      return sendToSlack(args);
    case 'linear':
      return sendToLinear(args);
    case 'zendesk':
      return sendToZendesk(args);
  }
}

export type { TicketArgs, TicketResult } from './types';
