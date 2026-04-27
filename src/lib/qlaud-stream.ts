// Parses qlaud's Anthropic-shape SSE stream into a typed event stream
// the React UI can consume. Used by the client message-stream component;
// the API route is a pure passthrough (it just pipes the upstream SSE
// straight to the browser without parsing).

export type StreamEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'text_delta'; index: number; text: string }
  | { type: 'thinking_delta'; index: number; text: string }
  | {
      type: 'tool_use_start';
      index: number;
      tool_use_id: string;
      name: string;
    }
  | {
      type: 'tool_use_input_delta';
      index: number;
      partial_json: string;
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_stop' }
  | {
      type: 'tool_result';
      tool_use_id: string;
      output: unknown;
      is_error: boolean;
    };

/** Async generator that reads the chat-API SSE response and yields typed
 *  events. Caller drives consumption — when the generator returns, the
 *  stream is fully drained and the assistant turn has been persisted on
 *  the qlaud side via ctx.waitUntil. */
export async function* parseChatStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseEvent(raw);
        if (event) yield event;
      }
    }
    if (buffer.length > 0) {
      const event = parseEvent(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(raw: string): StreamEvent | null {
  let dataLine = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      dataLine = line.slice(6);
      break;
    }
  }
  if (!dataLine || dataLine === '[DONE]') return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(dataLine);
  } catch {
    return null;
  }
  const type = payload.type as string | undefined;
  if (!type) return null;

  switch (type) {
    case 'message_start': {
      const msg = payload.message as { id?: string } | undefined;
      return { type: 'message_start', messageId: msg?.id ?? '' };
    }
    case 'content_block_start': {
      const index = (payload.index as number) ?? 0;
      const cb = payload.content_block as Record<string, unknown> | undefined;
      if (!cb) return null;
      if (cb.type === 'tool_use') {
        return {
          type: 'tool_use_start',
          index,
          tool_use_id: String(cb.id),
          name: String(cb.name),
        };
      }
      // text/thinking blocks open without a useful payload — deltas carry the content.
      return null;
    }
    case 'content_block_delta': {
      const index = (payload.index as number) ?? 0;
      const delta = payload.delta as Record<string, unknown> | undefined;
      if (!delta) return null;
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        return { type: 'text_delta', index, text: delta.text };
      }
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        return { type: 'thinking_delta', index, text: delta.thinking };
      }
      if (
        delta.type === 'input_json_delta' &&
        typeof delta.partial_json === 'string'
      ) {
        return {
          type: 'tool_use_input_delta',
          index,
          partial_json: delta.partial_json,
        };
      }
      return null;
    }
    case 'content_block_stop': {
      return { type: 'content_block_stop', index: (payload.index as number) ?? 0 };
    }
    case 'message_stop':
      return { type: 'message_stop' };
    default:
      return null;
  }
}
