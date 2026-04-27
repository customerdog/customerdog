import { createHmac, timingSafeEqual } from 'node:crypto';

// HMAC-SHA256 verifier matching qlaud's webhook contract:
//   payload = `${X-Qlaud-Timestamp}.${rawBody}`
//   signature = hex(hmac-sha256(secret, payload))
//
// Use the raw request body (await req.text()) — JSON.stringify of a
// parsed object will not byte-for-byte match what qlaud signed.
export function verifyToolWebhook(
  headers: Headers,
  rawBody: string,
  secret: string,
): boolean {
  const ts = headers.get('x-qlaud-timestamp') ?? '';
  const sig = headers.get('x-qlaud-signature') ?? '';
  if (!ts || !sig) return false;
  const expected = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}
