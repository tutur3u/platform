/**
 * Every Worker call to Web names itself. Web's proxy answers an anonymous
 * API request without a User-Agent (the sign-in exchange and the session
 * refresh carry no session) with 400, and its abuse guard treats a missing
 * one as a blocked client. The name is not a credential: it only keeps the
 * Worker's own calls from looking like an unnamed script.
 */
export const WEB_ORIGIN = 'https://tuturuuu.com';
export const MASTERMIND_USER_AGENT = 'Tuturuuu-Mastermind/1.0';

function webUrl(input: RequestInfo | URL) {
  try {
    return new URL(input instanceof Request ? input.url : String(input));
  } catch {
    return null;
  }
}

/**
 * `fetch` that adds the Mastermind User-Agent to requests for the Web origin
 * that carry none. Other origins and an explicit User-Agent are unchanged.
 */
export function withWebUserAgent(fetcher: typeof fetch): typeof fetch {
  return (input, init) => {
    if (webUrl(input)?.origin !== WEB_ORIGIN) return fetcher(input, init);
    const request = new Request(input, init);
    if (request.headers.has('user-agent')) return fetcher(request);
    const headers = new Headers(request.headers);
    headers.set('User-Agent', MASTERMIND_USER_AGENT);
    return fetcher(new Request(request, { headers }));
  };
}

const installed = Symbol.for('tuturuuu.mastermind.webUserAgent');

/** Installs `withWebUserAgent` on the Worker's global `fetch`, once. */
export function installWebUserAgent(target: typeof globalThis = globalThis) {
  const holder = target as typeof globalThis & { [installed]?: true };
  if (holder[installed]) return;
  target.fetch = withWebUserAgent(target.fetch.bind(target));
  holder[installed] = true;
}
