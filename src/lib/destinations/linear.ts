import 'server-only';
import { env } from '../env';
import type { TicketArgs } from './types';

/**
 * Linear destination — creates an issue via Linear's GraphQL API.
 * Returns the issue's URL for the activity log + the AI's reply.
 *
 * Setup: in Linear, Settings → API → Personal API keys → create one;
 * paste into LINEAR_API_KEY. Find your team id at
 * Settings → Teams → click your team → URL has the id.
 */

const LINEAR_API = 'https://api.linear.app/graphql';

const PRIORITY_MAP: Record<string, number> = {
  // Linear: 0=none, 1=urgent, 2=high, 3=medium, 4=low
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

export async function sendToLinear(
  t: TicketArgs,
): Promise<{ resultUrl: string | null }> {
  const apiKey = env.LINEAR_API_KEY();
  const teamId = env.LINEAR_TEAM_ID();
  if (!apiKey || !teamId) {
    throw new Error(
      'LINEAR_API_KEY and LINEAR_TEAM_ID are required for ticket_destination=linear.',
    );
  }

  const description = [
    t.details,
    '',
    '---',
    `**Visitor contact**: ${[t.contact.email, t.contact.phone].filter(Boolean).join(' · ') || '_none collected_'}`,
    `**Visitor id**: \`${t.visitorId}\``,
    `**Conversation thread**: \`${t.threadId}\``,
  ].join('\n');

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url title }
      }
    }
  `;

  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          teamId,
          title: t.summary.slice(0, 250),
          description,
          priority: PRIORITY_MAP[t.priority] ?? 3,
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Linear ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as {
    data?: { issueCreate?: { success: boolean; issue?: { url: string } } };
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    throw new Error(`Linear: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  const issue = body.data?.issueCreate?.issue;
  return { resultUrl: issue?.url ?? null };
}
