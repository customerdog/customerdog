import 'server-only';
import { env } from '../env';
import type { TicketArgs } from './types';

/**
 * Slack destination — POSTs a Block Kit message to the configured
 * incoming webhook URL. Returns the channel + ts so admin can deep-link
 * (Slack webhooks don't return URLs, so we synthesize a best-effort one
 * if the webhook URL hints at the workspace).
 *
 * Setup: in Slack, create an Incoming Webhook app for the channel you
 * want tickets to land in, copy the URL into SLACK_WEBHOOK_URL.
 */

export async function sendToSlack(t: TicketArgs): Promise<{ resultUrl: string | null }> {
  const url = env.SLACK_WEBHOOK_URL();
  if (!url) {
    throw new Error(
      'SLACK_WEBHOOK_URL is not set — set it in env or change ticket_destination.',
    );
  }

  const contactLines: string[] = [];
  if (t.contact.email) contactLines.push(`✉️  ${t.contact.email}`);
  if (t.contact.phone) contactLines.push(`📞 ${t.contact.phone}`);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🐕 ${t.summary}`.slice(0, 150) },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: t.details.length > 2900 ? t.details.slice(0, 2900) + '…' : t.details,
      },
    },
    contactLines.length > 0
      ? {
          type: 'section',
          fields: contactLines.map((line) => ({
            type: 'mrkdwn',
            text: line,
          })),
        }
      : null,
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Visitor \`${t.visitorId.slice(0, 16)}…\` · Priority: *${t.priority}* · Thread \`${t.threadId.slice(0, 16)}…\``,
        },
      ],
    },
  ].filter(Boolean);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blocks, text: t.summary }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Slack ${res.status}: ${detail.slice(0, 300)}`);
  }

  // Slack webhooks return "ok" on success — no URL. We don't have a
  // good deep-link without OAuth. Admin can find it via the channel.
  return { resultUrl: null };
}
