import 'server-only';
import { supabase, type ActionRow, type ConversationRow } from './supabase';

/**
 * Activity log writes: every ticket filed, email sent, contact captured.
 *
 * All writes are fire-and-forget — never block the chat response on a
 * Supabase write. If a row fails, we log to stderr; the conversation
 * still completes for the visitor.
 *
 * The `actions` table is what the admin browses at /admin/activity.
 */

/** Look up the conversation row by qlaud thread id (the chat handler
 *  inserted it on the visitor's first message). Returns null if not
 *  found — we still log the action without a conversation_id. */
export async function findConversationByThread(
  threadId: string,
): Promise<ConversationRow | null> {
  const { data, error } = await supabase()
    .from('conversations')
    .select('*')
    .eq('qlaud_thread_id', threadId)
    .maybeSingle();
  if (error) {
    console.error('[activity] findConversationByThread:', error.message);
    return null;
  }
  return (data as ConversationRow | null) ?? null;
}

export async function logAction(args: {
  conversationId: string | null;
  type: ActionRow['type'];
  payload: Record<string, unknown>;
  resultUrl?: string | null;
}): Promise<void> {
  const { error } = await supabase().from('actions').insert({
    conversation_id: args.conversationId,
    type: args.type,
    payload: args.payload,
    result_url: args.resultUrl ?? null,
  });
  if (error) {
    console.error('[activity] logAction failed:', error.message);
  }
}

/** Update the conversation row with collected contact info AND log a
 *  'contact_collected' action so admin sees when it happened. */
export async function recordContactCollected(args: {
  conversationId: string;
  email?: string | null;
  phone?: string | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (args.email) patch.contact_email = args.email;
  if (args.phone) patch.contact_phone = args.phone;
  if (Object.keys(patch).length === 0) return;

  const { error: upErr } = await supabase()
    .from('conversations')
    .update(patch)
    .eq('id', args.conversationId);
  if (upErr) {
    console.error('[activity] update conversation contact:', upErr.message);
  }

  await logAction({
    conversationId: args.conversationId,
    type: 'contact_collected',
    payload: { email: args.email ?? null, phone: args.phone ?? null },
  });
}
