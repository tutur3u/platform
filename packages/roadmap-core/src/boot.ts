import bootUrl from './boot/roadmap-boot.js?url';

/**
 * The boot script (lite mode, then the hydration loader) as an async
 * external script in <head>: a hashed same-origin asset that script-src
 * 'self' allows, so the page adds no inline script to the CSP. Async, so it
 * never blocks parsing or rendering; at ~2 KB it runs as soon as it
 * arrives, well before the stylesheet and body allow a first paint.
 */
export function bootScript() {
  return { src: bootUrl, async: true };
}
