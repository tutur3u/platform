const AUTH_LOOP_PATHS = new Set([
  '/api/auth/callback',
  '/login',
  '/verify-token',
]);
const AUTH_REDIRECT_MAX_DEPTH = 5;

export function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeAuthRedirectPath(
  rawValue: string | null | undefined,
  requestOrigin: string,
  fallbackPath = '/'
): string {
  if (!rawValue) {
    return fallbackPath;
  }

  let candidate = rawValue;

  for (let depth = 0; depth < AUTH_REDIRECT_MAX_DEPTH; depth += 1) {
    // Decode an encoded outer path, never query data inside an already parsed URL.
    if (/^(?:%2f|https?%3a)/i.test(candidate))
      candidate = decodeURIComponentSafely(candidate);
    let url: URL;

    try {
      url = new URL(candidate, requestOrigin);
      if (
        url.origin !== requestOrigin ||
        new URL(decodeURIComponentSafely(url.pathname), requestOrigin)
          .origin !== requestOrigin
      )
        return fallbackPath;
    } catch {
      return fallbackPath;
    }

    if (AUTH_LOOP_PATHS.has(decodeURIComponentSafely(url.pathname))) {
      const nestedValue =
        url.searchParams.get('nextUrl') ??
        url.searchParams.get('next') ??
        url.searchParams.get('returnUrl');

      if (!nestedValue) {
        return fallbackPath;
      }

      candidate = nestedValue;
      continue;
    }

    return `${url.pathname}${url.search}`;
  }

  return fallbackPath;
}

/**
 * Prefixes the request's Next basePath (an app mounted at `tuturuuu.com/<app>`)
 * to a path-absolute app path, once. At the origin root it is the identity.
 */
export function withRequestBasePath(
  req: { nextUrl: { basePath: string } },
  path: string
) {
  const base = req.nextUrl.basePath;
  if (!base || !path.startsWith('/') || path.startsWith('//')) return path;
  const end = path.search(/[?#]/u);
  const pathname = end === -1 ? path : path.slice(0, end);
  if (pathname === base || pathname.startsWith(`${base}/`)) return path;
  return `${base}${pathname === '/' ? '' : pathname}${end === -1 ? '' : path.slice(end)}`;
}
