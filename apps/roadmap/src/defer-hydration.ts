/**
 * Start the client bundle at the reader's first intent or just after the
 * first paint, not with the document.
 *
 * The server-rendered page is complete and readable without JavaScript, but
 * the SSR document asks for ~200 KB of modules up front (modulepreload links
 * plus an async entry). On a slow phone those compete with the stylesheet,
 * fonts and HTML for bandwidth and delay the first paint. The Worker rewrites
 * the document before hashing its inline scripts, changing attributes only:
 *
 * - each `<link rel="modulepreload">` keeps its element and href but gets the
 *   inert rel `roadmap-modulepreload`, so nothing is fetched;
 * - the entry `<script type="module" async src>` keeps its element and src
 *   but becomes `type="text/plain"`, which browsers never fetch or run (the
 *   asset smoke still sees and checks its src).
 *
 * No element is added, so hydration matches and the CSP keeps exactly the
 * inline scripts the router renders. The loader itself is the external boot
 * script (src/boot/roadmap-boot.js, allowed by script-src 'self'): it loads
 * the bundle on the first INTENT_EVENTS or within IDLE_TIMEOUT_MS of the
 * largest contentful paint (FALLBACK_MS at the latest) and replays a first
 * tap on a button that is not hydrated yet. Nothing is prefetched or
 * prerendered (the zone 503s Sec-Purpose: prefetch).
 */
export const DEFERRED_PRELOAD_REL = 'roadmap-modulepreload';
export const DEFERRED_ENTRY_ATTRIBUTE = 'data-roadmap-entry';
export const INTENT_EVENTS = [
  'pointerdown',
  'touchstart',
  'keydown',
  'focusin',
] as const;
/** After the largest contentful paint, load in the next idle period or by this. */
export const IDLE_TIMEOUT_MS = 1_000;
/** Load by this time even if neither a paint nor an intent was reported. */
export const FALLBACK_MS = 4_000;

const MODULE_PRELOAD =
  /<link\b(?=[^>]*\brel="modulepreload")([^>]*\bhref="\/roadmap\/assets\/[^"]+\.js"[^>]*)>/g;
const MODULE_ENTRY =
  /<script type="module" async="" src="(\/roadmap\/assets\/[^"]+\.js)"><\/script>/;

export function deferHydration(html: string): string {
  const entry = MODULE_ENTRY.exec(html);
  if (!entry) return html;
  return html
    .replace(
      MODULE_PRELOAD,
      (_tag, attributes: string) =>
        `<link${attributes.replace('rel="modulepreload"', `rel="${DEFERRED_PRELOAD_REL}"`)}>`
    )
    .replace(
      entry[0],
      `<script type="text/plain" ${DEFERRED_ENTRY_ATTRIBUTE}="" src="${entry[1]}"></script>`
    );
}
