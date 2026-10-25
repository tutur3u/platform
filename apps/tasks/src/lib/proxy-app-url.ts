import type { NextRequest } from 'next/server';

/**
 * Builds a same-app URL for a proxy redirect or rewrite from an app-relative
 * path such as `/en/personal/tasks?view=list`. The request's Next basePath is
 * prefixed, so the URL stays under `tuturuuu.com/tasks` when Tasks is served
 * there and is unchanged at the origin root; `new URL(path, nextUrl)` would
 * drop the base. Only the path and query of `path` are used (the origin is
 * always the request's), a path that already carries the base is not
 * prefixed twice, and the request's trailing slash is not carried over.
 */
export function proxyAppUrl(req: NextRequest, path: string) {
  const parsed = new URL(path, 'http://app.invalid');
  const base = req.nextUrl.basePath;
  const pathname =
    base && (parsed.pathname === base || parsed.pathname.startsWith(`${base}/`))
      ? parsed.pathname.slice(base.length) || '/'
      : parsed.pathname;
  const url = new URL(req.nextUrl.origin);
  url.pathname = base && pathname === '/' ? base : `${base}${pathname}`;
  url.search = parsed.search;
  return url;
}
