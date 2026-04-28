import 'server-only';
import { env } from '../env';
import type { TicketArgs } from './types';

/**
 * Zendesk destination — POSTs a ticket via Zendesk's Tickets API.
 * Returns the ticket URL for the activity log.
 *
 * Setup: Zendesk dashboard → Apps and integrations → APIs →
 * Zendesk API. Enable token access, create a token. Set:
 *   ZENDESK_SUBDOMAIN  — the slug in your-subdomain.zendesk.com
 *   ZENDESK_EMAIL      — the email of the agent the API acts as
 *   ZENDESK_API_TOKEN  — the token you generated
 *
 * Reference: https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/#create-ticket
 */

const PRIORITY_MAP: Record<string, string> = {
  urgent: 'urgent',
  high: 'high',
  normal: 'normal',
  low: 'low',
};

export async function sendToZendesk(
  t: TicketArgs,
): Promise<{ resultUrl: string | null }> {
  const subdomain = env.ZENDESK_SUBDOMAIN();
  const agentEmail = env.ZENDESK_EMAIL();
  const apiToken = env.ZENDESK_API_TOKEN();
  if (!subdomain || !agentEmail || !apiToken) {
    throw new Error(
      'ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN all required for ticket_destination=zendesk.',
    );
  }

  // Zendesk uses HTTP Basic with `<email>/token:<token>`.
  const auth = Buffer.from(`${agentEmail}/token:${apiToken}`).toString('base64');

  const ticketBody = {
    ticket: {
      subject: t.summary.slice(0, 250),
      comment: {
        body: [
          t.details,
          '',
          '---',
          `Visitor contact: ${[t.contact.email, t.contact.phone].filter(Boolean).join(' / ') || 'none collected'}`,
          `Visitor id: ${t.visitorId}`,
          `Conversation thread: ${t.threadId}`,
        ].join('\n'),
      },
      priority: PRIORITY_MAP[t.priority] ?? 'normal',
      requester: t.contact.email
        ? { email: t.contact.email }
        : undefined,
      tags: ['customerdog', 'ai-escalated'],
    },
  };

  const res = await fetch(
    `https://${subdomain}.zendesk.com/api/v2/tickets.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(ticketBody),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Zendesk ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as { ticket?: { id: number; url: string } };
  const ticketId = body.ticket?.id;
  return {
    resultUrl: ticketId
      ? `https://${subdomain}.zendesk.com/agent/tickets/${ticketId}`
      : null,
  };
}
