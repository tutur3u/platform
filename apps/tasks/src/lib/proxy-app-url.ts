import type { NextRequest } from 'next/server';

/**
 * Builds a same-app URL for a proxy redirect or rewrite from an app-relative
 * path such as `/en/personal/tasks?view=list`. Cloning `nextUrl` keeps the
 * Next basePath, so the URL stays under `tuturuuu.com/tasks` when Tasks is
 * served there and is unchanged at the origin root; `new URL(path, nextUrl)`
 * would drop the base. Only the path and query of `path` are used, and a path
 * that already carries the base (from an absolute return URL) is not prefixed
 * twice.
 */
export function proxyAppUrl(req: NextRequest, path: string) {
  const parsed = new URL(path, 'http://app.invalid');
  const url = req.nextUrl.clone();
  const base = url.basePath;
  url.pathname =
    base && (parsed.pathname === base || parsed.pathname.startsWith(`${base}/`))
      ? parsed.pathname.slice(base.length) || '/'
      : parsed.pathname;
  url.search = parsed.search;
  return url;
}
