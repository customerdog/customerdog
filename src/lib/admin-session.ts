import 'server-only';

/**
 * Admin session: a single shared password (env: ADMIN_PASSWORD) gates
 * /admin/*. On successful login we issue a signed cookie containing
 * {exp: <unix-seconds>}, signed with HMAC-SHA256 using ADMIN_COOKIE_SECRET.
 *
 * Why no Clerk: customerdog is a clone-and-deploy product. The owner
 * sets ADMIN_PASSWORD in env, signs in once, gets a 30-day cookie. No
 * third-party auth service for admins; no DB row for the user. If you
 * ever need multi-admin / SSO, swap this module for Clerk.
 *
 * Crypto choice: Web Crypto (crypto.subtle) — works in BOTH Node and
 * Edge runtimes, so middleware (Edge by default) and server actions
 * (Node) can share this code.
 */

const COOKIE_NAME = 'cd_admin';
const DEFAULT_TTL_S = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();
const dec = new TextDecoder();

// ─── Base64URL (works in Edge + Node — no Buffer dep) ──────────────────

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): ArrayBuffer {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

// ─── HMAC ──────────────────────────────────────────────────────────────

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

// ─── Token ─────────────────────────────────────────────────────────────

/** Mint `<payloadB64>.<signatureB64>` token. */
export async function signAdminToken(
  secret: string,
  ttlSeconds = DEFAULT_TTL_S,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadB64 = b64urlEncode(enc.encode(JSON.stringify({ exp })));
  const key = await hmacKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  return `${payloadB64}.${b64urlEncode(new Uint8Array(sigBuf))}`;
}

/** True if the token signature verifies AND the embedded exp is in the
 *  future. Constant-time on the signature comparison via subtle.verify. */
export async function verifyAdminToken(
  secret: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let key: CryptoKey;
  try {
    key = await hmacKey(secret);
  } catch {
    return false;
  }
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sigB64),
      enc.encode(payloadB64),
    );
  } catch {
    return false;
  }
  if (!ok) return false;
  try {
    const { exp } = JSON.parse(dec.decode(new Uint8Array(b64urlDecode(payloadB64)))) as {
      exp: unknown;
    };
    if (typeof exp !== 'number') return false;
    return exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// ─── Password compare (constant-time) ──────────────────────────────────

/** SHA-256 both inputs, then constant-time byte compare. Defends against
 *  trivial timing oracles on a `===` over the raw password. */
export async function passwordsEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// ─── Cookie names exported for callers ─────────────────────────────────

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_COOKIE_MAX_AGE_S = DEFAULT_TTL_S;
