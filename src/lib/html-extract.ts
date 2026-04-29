import 'server-only';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { htmlToText } from './html-to-text';

/**
 * Layered HTML → text extraction. Tried in order; first one to return
 * usable content wins.
 *
 *   1. Mozilla Readability (Firefox Reader Mode algorithm)
 *      Best for article-style pages — docs, blog posts, help center
 *      articles. Identifies the main content tree, drops nav/footer/
 *      sidebars/ads.
 *
 *   2. body.textContent
 *      Fallback for non-article pages — landing pages, pricing,
 *      multi-section marketing. Less polished but always returns
 *      *something* usable.
 *
 *   3. Regex-based htmlToText (defense in depth)
 *      If jsdom or Readability throws on malformed HTML, the
 *      regex stripper still finishes the job.
 *
 * Why three layers: Readability is purpose-built and gives the
 * cleanest output, but it's opinionated — for a homepage with a
 * hero + features grid + footer, it sometimes returns very little.
 * The body fallback handles those. The regex final fallback handles
 * jsdom edge cases (broken HTML in the wild).
 */

const MIN_GOOD_LENGTH = 200; // chars below which we don't trust the result

export function extractContent(html: string, url: string): string {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // 1. Readability — needs a clone, otherwise it mutates the doc
    //    and the body fallback below sees an empty tree.
    const reader = new Readability(doc.cloneNode(true) as Document);
    const article = reader.parse();
    if (
      article &&
      typeof article.textContent === 'string' &&
      article.textContent.trim().length >= MIN_GOOD_LENGTH
    ) {
      return cleanWhitespace(article.textContent);
    }

    // 2. body.textContent — strips <script>/<style>/<noscript> first.
    for (const sel of ['script', 'style', 'noscript', 'template', 'svg']) {
      doc.querySelectorAll(sel).forEach((n) => n.remove());
    }
    const bodyText = doc.body?.textContent ?? '';
    if (bodyText.trim().length >= MIN_GOOD_LENGTH) {
      return cleanWhitespace(bodyText);
    }
  } catch {
    // jsdom can throw on truly malformed HTML — fall through.
  }

  // 3. Regex stripper. Always returns *something*.
  return htmlToText(html);
}

function cleanWhitespace(s: string): string {
  return s
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
