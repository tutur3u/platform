import { stripCloudflareAccessCredentials } from '@tuturuuu/utils/cloudflare-access';

/**
 * Client-originated `x-tuturuuu-*` headers the staging issuer may forward to
 * Next. EVERY other `x-tuturuuu-*` name is stripped, including every
 * server-owned one (origin proof, app base, runtime, integrity proofs); the
 * Worker sets its own after stripping.
 *
 * Next treats both forwarded values as untrusted client input:
 * - `x-tuturuuu-turnstile-token` is only a candidate token; Next verifies it
 *   server-side with Turnstile before it counts for anything.
 * - `x-tuturuuu-account-action` is a same-origin intent hint for account
 *   flows. It is never authorization; the session and permission checks are.
 *
 * Values are bounded: printable ASCII without spaces, under a per-name cap.
 * Out-of-bounds values are dropped, never truncated.
 */
export const CLIENT_TUTURUUU_HEADERS: Readonly<Record<string, number>> = {
  'x-tuturuuu-turnstile-token': 2048,
  'x-tuturuuu-account-action': 16,
};

const printableAscii = /^[\x21-\x7e]+$/u;

/** Vercel deployment-protection controls a client must never supply. */
export const VERCEL_BYPASS_PARAMETERS = [
  'x-vercel-protection-bypass',
  'x-vercel-set-bypass-cookie',
] as const;

function clientTuturuuuValueAllowed(name: string, value: string) {
  const cap = CLIENT_TUTURUUU_HEADERS[name];
  return (
    cap !== undefined &&
    value.length > 0 &&
    value.length <= cap &&
    printableAscii.test(value)
  );
}

/**
 * Removes every client-supplied header the Worker must own before it adds its
 * own forwarding identity: Access credentials and cookies (by parsed name),
 * `forwarded`/`x-forwarded-*`/`x-real-ip`/`true-client-ip`/`cf-connecting-ip`,
 * every `x-vercel-*` (including bypass controls) and every `x-tuturuuu-*`
 * outside the bounded client allowlist.
 */
export function sanitizeForwardHeaders(headers: Headers) {
  stripCloudflareAccessCredentials(headers);
  for (const name of [...headers.keys()]) {
    if (
      name === 'forwarded' ||
      name === 'x-real-ip' ||
      name === 'true-client-ip' ||
      name === 'cf-connecting-ip' ||
      name.startsWith('x-forwarded-') ||
      name.startsWith('x-vercel-')
    ) {
      headers.delete(name);
      continue;
    }
    if (
      name.startsWith('x-tuturuuu-') &&
      !clientTuturuuuValueAllowed(name, headers.get(name) ?? '')
    )
      headers.delete(name);
  }
  return headers;
}

function decodedKey(pair: string) {
  const raw = pair.split('=', 1)[0] ?? '';
  try {
    return decodeURIComponent(raw.replaceAll('+', ' ')).trim().toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The raw query without Vercel bypass parameters, or `undefined` when nothing
 * was removed so the original bytes are forwarded unchanged. A pair whose key
 * cannot be decoded is dropped when it could spell a Vercel control.
 */
export function sanitizedSearch(url: URL): string | undefined {
  if (!url.search) return undefined;
  const pairs = url.search.slice(1).split('&');
  const kept = pairs.filter((pair) => {
    const key = decodedKey(pair);
    if (key === null) return !/vercel/iu.test(pair);
    return !(VERCEL_BYPASS_PARAMETERS as readonly string[]).includes(key);
  });
  if (kept.length === pairs.length) return undefined;
  return kept.length ? `?${kept.join('&')}` : '';
}

function setCookieName(cookie: string) {
  const index = cookie.indexOf('=');
  return (index === -1 ? cookie : cookie.slice(0, index)).trim();
}

/**
 * Removes Vercel platform state before a response reaches the browser: every
 * `x-vercel-*` header and any `_vercel*` cookie (e.g. `_vercel_jwt`).
 */
export function sanitizeUpstreamResponseHeaders(headers: Headers) {
  const cookies = headers.getSetCookie();
  headers.delete('set-cookie');
  for (const cookie of cookies)
    if (!setCookieName(cookie).toLowerCase().startsWith('_vercel'))
      headers.append('set-cookie', cookie);
  for (const name of [...headers.keys()])
    if (name.startsWith('x-vercel-')) headers.delete(name);
  return headers;
}
