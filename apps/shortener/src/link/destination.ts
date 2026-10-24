// Script-bearing schemes never reach a browser navigation from this app.
const SCRIPT_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:']);

/** Legacy parity: any WHATWG-parseable stored target is a valid destination. */
export function isParseableDestination(link: string): boolean {
  try {
    new URL(link);
    return true;
  } catch {
    return false;
  }
}

/** Parseable and safe for an HTTP redirect or client-side navigation. */
export function isNavigableDestination(link: string): boolean {
  try {
    return !SCRIPT_PROTOCOLS.has(new URL(link).protocol);
  } catch {
    return false;
  }
}

/**
 * Keep the stored target byte-for-byte when it is a valid header value; only a
 * target with spaces or non-ASCII characters is serialized by the URL parser.
 * Stored rows are never rewritten.
 */
export function locationHeaderValue(link: string): string {
  return /^[\x21-\x7e]+$/.test(link) ? link : new URL(link).href;
}

/** The query exactly as received, including duplicate keys and order. */
export function rawSearch(requestUrl: string): string {
  const index = requestUrl.indexOf('?');
  if (index < 0) return '';
  const hash = requestUrl.indexOf('#', index);
  return requestUrl.slice(index, hash < 0 ? undefined : hash);
}
