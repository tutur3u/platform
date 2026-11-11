/** Markup and size checks the pre-seal doctor runs on the public documents. */
import { MAX_DOCUMENT_BYTES } from '../src/csp.ts';

/**
 * The navbar logo sits beside the visible brand name, so its alt text must be
 * empty: alt="Tuturuuu" there makes screen readers say the name twice (axe
 * image-redundant-alt).
 */
export function redundantAltFailures(html) {
  const failures = [];
  for (const match of String(html).matchAll(
    /<img\b[^>]*\balt="([^"]+)"[^>]*>\s*<span\b[^>]*>([^<]+)<\/span>/gi
  )) {
    if (match[1].trim().toLowerCase() === match[2].trim().toLowerCase())
      failures.push(
        `an image repeats its adjacent text "${match[2].trim()}" as alt (image-redundant-alt)`
      );
  }
  return failures;
}

/**
 * Speculative loads the tuturuuu.com zone cannot serve. Cloudflare Speed
 * Brain answers every `Sec-Purpose: prefetch` request with 503, even for a
 * cached URL, so a prefetch or prerender link only ever yields a failed
 * request and a console error (production, 11 Nov 2026). workers.dev
 * previews do not show it, so the rule lives here.
 */
export function speculativeLinks(html) {
  const found = [];
  for (const match of String(html).matchAll(/<link\b([^>]*)>/gi)) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(match[1])?.[1] ?? '';
    const tokens = rel.toLowerCase().split(/\s+/);
    if (tokens.includes('prefetch') || tokens.includes('prerender')) {
      found.push(
        /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(match[1])?.[1] ?? '(no href)'
      );
    }
  }
  if (String(html).toLowerCase().includes('speculationrules'))
    found.push('speculationrules');
  return found;
}

/**
 * Every public document stays under half the CSP limit. Past
 * MAX_DOCUMENT_BYTES the Worker cannot hash inline scripts, so the router's
 * bootstrap and the hydration loader are blocked and the page never
 * hydrates. Sizes are characters, as the CSP check measures them.
 */
export const DOCUMENT_BUDGET = MAX_DOCUMENT_BYTES / 2;

export function documentBudgetFailures(document) {
  const size = document?.size;
  if (typeof size !== 'number')
    return [`${document?.path} size was not measured`];
  if (size <= DOCUMENT_BUDGET) return [];
  return [
    `${document.path} is ${size} characters, over the ${DOCUMENT_BUDGET} budget (half the ${MAX_DOCUMENT_BYTES} CSP limit, past which the page cannot hydrate)`,
  ];
}

/** One line per document: its size and its margin to the CSP limit. */
export function documentBudgetReport(documents = []) {
  return documents.map(
    (document) =>
      `document size ${document.path}: ${Math.round(document.size / 1024)} KiB, ${Math.round((1 - document.size / MAX_DOCUMENT_BYTES) * 100)}% under the ${MAX_DOCUMENT_BYTES / 1024} KiB CSP limit (budget ${DOCUMENT_BUDGET / 1024} KiB)`
  );
}
