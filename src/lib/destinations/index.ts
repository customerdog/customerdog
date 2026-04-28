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
      const to = env.TICKET_EMAIL_TO();
      if (!to) {
        throw new Error(
          'TICKET_EMAIL_TO is not set — cannot file an email ticket. Set it in env or change ticket_destination.',
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
