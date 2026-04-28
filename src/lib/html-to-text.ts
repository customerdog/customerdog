import 'server-only';

/**
 * Minimal HTML → plain-text extractor for KB ingestion. We don't need
 * fidelity — we just want the prose so the model can answer from it.
 *
 * Trade-offs vs a real parser (cheerio / jsdom):
 *   - 50 LOC, zero deps, runs in <1ms on a 100KB doc.
 *   - Does NOT handle deeply nested malformed HTML perfectly.
 *   - Does NOT execute JS (which is fine — we only want static prose).
 *
 * If you regularly ingest sites that depend on client-side rendering
 * (Notion exports, Docusaurus' raw HTML), paste the markdown source
 * directly via /admin/kb instead of the URL.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function htmlToText(html: string): string {
  // 1. Strip non-content blocks entirely.
  let s = html.replace(
    /<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );

  // 2. HTML comments.
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Convert structural tags to newlines so prose has paragraph breaks.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(
    /<\/(p|div|section|article|header|footer|nav|aside|main|h[1-6]|li|tr|table|blockquote)>/gi,
    '\n',
  );

  // 4. Strip every remaining tag.
  s = s.replace(/<[^>]+>/g, '');

  // 5. Decode entities (named + numeric).
  s = s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, raw: string) => {
    if (raw[0] === '#') {
      const code =
        raw[1] === 'x' || raw[1] === 'X'
          ? parseInt(raw.slice(2), 16)
          : parseInt(raw.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        return String.fromCodePoint(code);
      }
      return m;
    }
    return NAMED_ENTITIES[raw.toLowerCase()] ?? m;
  });

  // 6. Whitespace cleanup. Preserve paragraph breaks, collapse runs.
  s = s.replace(/[ \t\r\f\v]+/g, ' ');
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}
