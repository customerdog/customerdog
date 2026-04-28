import type { ToolDefinition } from '@/lib/qlaud';

/**
 * Source of truth for the tools registered with qlaud. Used by:
 *   - scripts/register-tools.ts (one-shot bootstrap, run after deploy)
 *   - the matching webhook handlers under src/app/api/tools/<slug>/
 *
 * To add a new tool: add an entry here, drop a route under
 * src/app/api/tools/<slug>/route.ts, set QLAUD_TOOL_SECRET_<NAME> in
 * env, then re-run `npm run register-tools`.
 */
export function toolDefs(baseUrl: string): ToolDefinition[] {
  return [
    {
      name: 'create_ticket',
      description:
        "Escalate the visitor's issue to a human by filing a ticket. Use this when you cannot fully resolve the issue from the knowledge base, OR when the visitor explicitly asks to talk to a human. The ticket is routed to the company's configured destination (email / Slack / Linear / Zendesk). Always collect contact info from the visitor first if the system instructions say so.",
      input_schema: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              "One-sentence headline of the issue, written for a human support agent reading their inbox. Example: 'Visitor can't reset password — link expires before they click it.'",
          },
          details: {
            type: 'string',
            description:
              'Full context: what the visitor described, what you tried, why escalation is needed. Markdown formatting OK.',
          },
          contact: {
            type: 'object',
            description:
              'Contact info collected from the visitor. Provide at least one of email or phone if the system instructions require it.',
            properties: {
              email: {
                type: 'string',
                description: "Visitor's email address (validated format).",
              },
              phone: {
                type: 'string',
                description:
                  "Visitor's phone, in international format if possible.",
              },
            },
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
            description:
              "Use 'urgent' only for active outages or things blocking a paying customer. Default 'normal'.",
          },
        },
        required: ['summary', 'details', 'contact'],
      },
      webhook_url: `${baseUrl}/api/tools/create-ticket`,
      timeout_ms: 20000,
    },
    {
      name: 'send_email_to_user',
      description:
        "Send a follow-up email to the visitor (e.g., a fresh password reset link, a copy of the resolution, or a confirmation of the ticket you filed). Only use after collecting the visitor's email address. Don't send promotional content.",
      input_schema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description:
              "Visitor's email address (must be the one they provided; do not invent).",
          },
          subject: {
            type: 'string',
            description: 'Short, clear subject line.',
          },
          body: {
            type: 'string',
            description:
              "Plain-text email body. Don't include marketing footers; the email is transactional.",
          },
        },
        required: ['to', 'subject', 'body'],
      },
      webhook_url: `${baseUrl}/api/tools/send-email`,
      timeout_ms: 15000,
    },
  ];
}
