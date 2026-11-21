const APEX = 'tuturuuu.com';
const BASE = '/mastermind';
const HOST = 'mastermind.tuturuuu.com';

/**
 * `tuturuuu.com/mastermind` and its children answer a plain 302 to the
 * dedicated host, keeping the rest of the path and the query. The gateway
 * never proxies these paths: the command center is not served on the apex
 * (see apps/docs/build/devops/mastermind-web.mdx).
 */
export function mastermindRedirectDestination(request: Request): URL | null {
  const { host, pathname, search } = new URL(request.url);
  if (host !== APEX) return null;
  if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return null;
  const url = new URL(`https://${HOST}`);
  url.pathname = pathname.slice(BASE.length) || '/';
  url.search = search;
  return url;
}

export function mastermindRedirect(request: Request): Response | null {
  const target = mastermindRedirectDestination(request);
  if (!target) return null;
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.href,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
