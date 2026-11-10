/**
 * Content-Security-Policy for roadmap HTML documents.
 *
 * Script policy is hash-based. The Worker hashes the inline scripts present
 * in its own SSR output (theme bootstrap, TanStack stream bootstrap and
 * boundary markers; the stream bootstrap differs per request, so the hashes
 * are computed per response). Anything injected after the Worker, or any
 * inline script that is not in this exact document, is blocked. The roadmap
 * renders untrusted text only through React (escaped) and has no raw-HTML
 * or dynamic-code sinks (guarded by a source test).
 *
 * No nonce: the document carries a shared public cache policy, and a cached
 * nonce would be replayable. No 'unsafe-inline' or 'unsafe-eval' for scripts.
 */

/** End tags may carry whitespace or attributes (`</script >`, `</script x>`). */
const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi;
const MAX_INLINE_SCRIPTS = 32;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** Text of every inline (no src) script element, exactly as served. */
export function inlineScripts(html: string): string[] {
  const scripts: string[] = [];
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    if (/(?:^|\s)src\s*=/i.test(match[1] ?? '')) continue;
    const body = match[2] ?? '';
    if (body.length) scripts.push(body);
  }
  return scripts;
}

export async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  let binary = '';
  for (const byte of new Uint8Array(digest))
    binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Directives other than script-src. Kept in one place for review. */
export const STATIC_DIRECTIVES = [
  "default-src 'self'",
  // Inline styles cannot run script. SSR progress-bar widths use style
  // attributes, and the shared marketing shell's mobile sheet (Radix scroll
  // lock) injects a runtime <style> whose contents cannot be hashed.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // Live refresh: same-origin /roadmap/api/hosts and the public GitHub API.
  "connect-src 'self' https://api.github.com",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
] as const;

export async function contentSecurityPolicy(html: string): Promise<string> {
  const scripts = inlineScripts(html);
  if (scripts.length > MAX_INLINE_SCRIPTS)
    throw new Error('Unexpected number of inline scripts');
  const hashes = [...new Set(await Promise.all(scripts.map(sha256Base64)))];
  const scriptSrc = [
    "script-src 'self'",
    ...hashes.map((hash) => `'sha256-${hash}'`),
  ].join(' ');
  return [scriptSrc, ...STATIC_DIRECTIVES].join('; ');
}

function isHtml(response: Response) {
  return /^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '');
}

/**
 * Attach the CSP to an HTML response from the SSR handler. Non-HTML
 * responses pass through untouched. An oversized or unexpected document
 * still gets a policy, with no inline script allowed.
 */
export async function withContentSecurityPolicy(
  response: Response
): Promise<Response> {
  if (!isHtml(response)) return response;
  const html = response.body ? await response.text() : '';
  let policy: string;
  try {
    if (html.length > MAX_DOCUMENT_BYTES) throw new Error('Document too large');
    policy = await contentSecurityPolicy(html);
  } catch {
    policy = ["script-src 'self'", ...STATIC_DIRECTIVES].join('; ');
  }
  const headers = new Headers(response.headers);
  headers.set('content-security-policy', policy);
  headers.delete('content-length');
  return new Response(response.body === null ? null : html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
