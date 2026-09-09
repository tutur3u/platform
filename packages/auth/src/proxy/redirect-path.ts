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

  let candidate = decodeURIComponentSafely(rawValue);

  for (let depth = 0; depth < AUTH_REDIRECT_MAX_DEPTH; depth += 1) {
    let url: URL;

    try {
      url = new URL(candidate, requestOrigin);
    } catch {
      return fallbackPath;
    }

    if (url.origin !== requestOrigin) {
      return fallbackPath;
    }

    if (AUTH_LOOP_PATHS.has(url.pathname)) {
      const nestedValue =
        url.searchParams.get('nextUrl') ??
        url.searchParams.get('next') ??
        url.searchParams.get('returnUrl');

      if (!nestedValue) {
        return fallbackPath;
      }

      candidate = decodeURIComponentSafely(nestedValue);
      continue;
    }

    return `${url.pathname}${url.search}`;
  }

  return fallbackPath;
}
