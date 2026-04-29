import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToolWebhook } from '@/lib/tools/verify-signature';
import { sendTicket } from '@/lib/destinations';
import { findConversationByThread, logAction, recordContactCollected } from '@/lib/activity';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getConfig } from '@/lib/supabase';
import { getToolByName } from '@/lib/tool-register';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * create_ticket tool webhook. qlaud POSTs here when the AI calls
 * create_ticket. We:
 *   1. HMAC-verify against QLAUD_TOOL_SECRET_CREATE_TICKET
 *   2. Validate input (zod) + check contact requirement against config
 *   3. Look up the conversation by qlaud thread id
 *   4. Dispatch the ticket to the configured destination
 *   5. Log the action to Supabase
 *   6. Return { output } back to qlaud, which feeds it to the model
 */

const inputSchema = z.object({
  summary: z.string().min(1).max(500),
  details: z.string().min(1).max(10_000),
  contact: z
    .object({
      email: z.string().email().optional().nullable(),
      phone: z.string().min(3).max(40).optional().nullable(),
    })
    .default({}),
  priority: z
    .enum(['low', 'normal', 'high', 'urgent'])
    .default('normal'),
});

type WebhookBody = {
  tool_id: string;
  tool_use_id: string;
  name: string;
  input: unknown;
  thread_id: string;
  end_user_id?: string | null;
  request_id?: string;
};

export async function POST(req: Request) {
  // Resolve the HMAC secret. Supabase is the source of truth (set by
  // ensureToolsRegistered on first admin load); env is a legacy
  // fallback for operators who already used the npm run register-tools
  // script.
  const reg = await getToolByName('create_ticket').catch(() => null);
  const secret = reg?.hmac_secret ?? env.QLAUD_TOOL_SECRET_CREATE_TICKET();
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
      output: `Tool input invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}. Tell the user you couldn't file the ticket and ask for clarification.`,
      is_error: true,
    });
  }
  const input = parsed.data;

  // Look up config + conversation in parallel.
  const [config, conversation] = await Promise.all([
    getConfig().catch((e) => {
      throw new Error(`getConfig: ${(e as Error).message}`);
    }),
    findConversationByThread(payload.thread_id),
  ]);

  // Enforce visitor_contact_required policy.
  const required = config.visitor_contact_required;
  const haveEmail = !!input.contact.email;
  const havePhone = !!input.contact.phone;
  const policyMet =
    required === 'none' ||
    (required === 'email' && haveEmail) ||
    (required === 'phone' && havePhone) ||
    (required === 'either' && (haveEmail || havePhone));
  if (!policyMet) {
    return NextResponse.json({
      output: `I can't file this ticket yet — our policy requires collecting visitor contact info first (${required}). Ask the visitor for it, then call create_ticket again with the contact field populated.`,
      is_error: true,
    });
  }

  // Rate limit per conversation — the abuse case is an injected prompt
  // looping inside one conversation. Skipped if we couldn't find the
  // conversation row (rare; logging issue, fail open).
  if (conversation) {
    const limit = await checkRateLimit({
      conversationId: conversation.id,
      type: 'ticket_created',
      ...RATE_LIMITS.ticket_created,
    });
    if (!limit.ok) {
      return NextResponse.json({
        output: `I've already filed ${limit.count} ticket${limit.count === 1 ? '' : 's'} for this conversation in the last hour. Tell the visitor our team will follow up on the existing ticket(s) — there's no need to file another. If they have new info to add, ask them to reply to whichever email they get from support.`,
        is_error: true,
      });
    }
  }

  // Persist any collected contact onto the conversation row + log it.
  if (conversation && (haveEmail || havePhone)) {
    void recordContactCollected({
      conversationId: conversation.id,
      email: input.contact.email ?? null,
      phone: input.contact.phone ?? null,
    });
  }

  // Dispatch.
  let resultUrl: string | null = null;
  try {
    const r = await sendTicket(config.ticket_destination, {
      summary: input.summary,
      details: input.details,
      contact: input.contact,
      priority: input.priority,
      visitorId: payload.end_user_id ?? 'unknown',
      threadId: payload.thread_id,
    });
    resultUrl = r.resultUrl;
  } catch (e) {
    return NextResponse.json({
      output: `I couldn't file the ticket: ${(e as Error).message}. Please try again later or contact us directly at ${config.support_email ?? '(no support email configured)'}.`,
      is_error: true,
    });
  }

  // Log the action (fire-and-forget).
  void logAction({
    conversationId: conversation?.id ?? null,
    type: 'ticket_created',
    payload: {
      summary: input.summary,
      destination: config.ticket_destination,
      priority: input.priority,
      contact: input.contact,
    },
    resultUrl,
  });

  // Tell the model what to relay to the visitor.
  const ack = resultUrl
    ? `Ticket filed (${resultUrl}). Tell the visitor we've created a ticket and someone will follow up at ${input.contact.email ?? input.contact.phone}.`
    : `Ticket filed via ${config.ticket_destination}. Tell the visitor we've escalated and someone will follow up at ${input.contact.email ?? input.contact.phone}.`;

  return NextResponse.json({ output: ack });
}
