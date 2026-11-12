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

/** The Workers runtime's streaming HTML parser (lol-html). */
declare const HTMLRewriter: new () => HtmlRewriter;
type HtmlRewriter = {
  on(
    selector: string,
    handlers: {
      element?(element: {
        hasAttribute(name: string): boolean;
        getAttribute(name: string): string | null;
        remove(): void;
        onEndTag(handler: () => void): void;
      }): void;
      text?(chunk: { text: string }): void;
    }
  ): HtmlRewriter;
  transform(response: Response): Response;
};

const MAX_INLINE_SCRIPTS = 32;
/**
 * Past this size a document gets no script hashes (see below). The pre-seal
 * doctor keeps every public page under half of it.
 */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/**
 * Text of every real inline (no src) script element, exactly as served.
 *
 * Collected by the runtime's HTML parser, not by scanning the text: a
 * `<script>` inside an attribute value, a comment or a raw-text element
 * (title, textarea, style, noscript) is data, never a script element, and is
 * never hashed into script-src. Text arrives in chunks; an element's text is
 * complete at its end tag. An unclosed script at end of file is left out, so
 * it stays blocked.
 */
export async function inlineScripts(html: string): Promise<string[]> {
  const scripts: string[] = [];
  let current: string | null = null;
  await new HTMLRewriter()
    .on('script', {
      element(element) {
        current = element.hasAttribute('src') ? null : '';
        element.onEndTag(() => {
          if (current) scripts.push(current);
          current = null;
        });
      },
      text(chunk) {
        if (current !== null) current += chunk.text;
      },
    })
    .transform(new Response(html))
    .text();
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
  const scripts = await inlineScripts(html);
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

/** Inline script types that are data, never executed. */
const DATA_SCRIPT_TYPES = new Set(['application/ld+json', 'application/json']);

/**
 * The document without executable inline scripts (classic, module, import
 * maps, speculation rules). Scripts with a src and data blocks stay.
 */
export async function withoutExecutableInlineScripts(
  html: string
): Promise<string> {
  return new HTMLRewriter()
    .on('script', {
      element(element) {
        if (element.hasAttribute('src')) return;
        const type = (element.getAttribute('type') ?? '').trim().toLowerCase();
        if (!DATA_SCRIPT_TYPES.has(type)) element.remove();
      },
    })
    .transform(new Response(html))
    .text();
}

/**
 * Attach the CSP to an HTML response from the SSR handler. Non-HTML
 * responses pass through untouched. An oversized or unexpected document
 * still gets a policy, with no inline script allowed.
 */
export async function withContentSecurityPolicy(
  response: Response,
  transform: (html: string) => string = (html) => html
): Promise<Response> {
  if (!isHtml(response)) return response;
  const original = response.body ? await response.text() : '';
  // The transform runs first, so every inline script it adds is hashed.
  let html = transform(original);
  let policy: string;
  try {
    if (html.length > MAX_DOCUMENT_BYTES) throw new Error('Document too large');
    policy = await contentSecurityPolicy(html);
  } catch {
    // No hashes means no inline script may run. Serve the document as
    // rendered (its external, same-origin module entry still loads under
    // 'self') without its executable inline scripts, so no unhashed script
    // is ever sent; JSON-LD data blocks stay.
    html = await withoutExecutableInlineScripts(original);
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
