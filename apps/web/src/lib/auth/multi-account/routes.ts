const LOCALE_ROUTE_SEGMENTS = new Set(['en', 'vi']);
const NON_PERSISTABLE_ROUTE_SEGMENTS = new Set([
  'add-account',
  'api',
  'auth',
  'login',
  'onboarding',
]);

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getPrimaryRouteSegment(path: string) {
  const [pathname = ''] = path.split(/[?#]/, 1);
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (!firstSegment) {
    return null;
  }

  return LOCALE_ROUTE_SEGMENTS.has(firstSegment)
    ? (segments[1] ?? null)
    : firstSegment;
}

function toSameOriginPath(value: string, origin: string) {
  if (value.startsWith('/') && !value.startsWith('//')) {
    const url = new URL(value, origin);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origin
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function normalizeMultiAccountRedirectPath(
  value: string | null | undefined,
  request: Pick<Request, 'url'>,
  fallback = '/'
) {
  if (!value) {
    return fallback;
  }

  const origin = new URL(request.url).origin;

  // Try the value as given before decoding it. Callers sometimes hand us a
  // wholly percent-encoded path, but a path that already works must be left
  // alone: decoding `/login?returnUrl=https%3A%2F%2Fapp%2Fx%3Fa%3D1%26b%3D2`
  // turns its encoded `&` into a real separator, so the nested return URL gets
  // truncated at the first parameter and the app is handed a broken address.
  return (
    toSameOriginPath(value, origin) ??
    toSameOriginPath(safeDecode(value), origin) ??
    fallback
  );
}

export function isPersistableMultiAccountRoutePath(route: string | null) {
  if (!route) {
    return false;
  }

  const segment = getPrimaryRouteSegment(route);

  return !segment || !NON_PERSISTABLE_ROUTE_SEGMENTS.has(segment);
}

export function normalizePersistableMultiAccountRoute(
  value: string | null | undefined,
  request: Pick<Request, 'url'>,
  fallback: string | null = null
) {
  const route = normalizeMultiAccountRedirectPath(value, request, '');

  return isPersistableMultiAccountRoutePath(route) ? route : fallback;
}

/**
 * Where the browser should land right after switching accounts.
 *
 * An explicit `targetRoute` is a navigation instruction, not something we store,
 * so the persistable filter must not apply to it — `/login` and `/add-account`
 * are non-persistable precisely because they are transient, and running the
 * target through that filter silently replaced a pending authentication flow
 * with the dashboard. Only the stored fallback stays filtered.
 */
export function resolveMultiAccountSwitchRedirect(
  payload: { lastRoute?: string | null; targetRoute?: string | null },
  request: Pick<Request, 'url'>
) {
  const target = normalizeMultiAccountRedirectPath(
    payload.targetRoute,
    request,
    ''
  );

  return (
    target ||
    normalizePersistableMultiAccountRoute(payload.lastRoute, request, '/') ||
    '/'
  );
}

/**
 * Where the browser should land right after adding an account.
 *
 * A cross-origin `returnUrl` belongs to an external app that still needs a
 * minted cross-app token, so we cannot navigate to it directly — but dropping it
 * strands the user on the dashboard with the sign-in they started forgotten.
 * Hand it back to `/login`, which is the only place that validates the URL
 * against the registered apps and completes the handoff.
 */
export function resolveMultiAccountAddRedirect(
  returnUrl: string | null | undefined,
  request: Pick<Request, 'url'>
) {
  const localPath = normalizeMultiAccountRedirectPath(returnUrl, request, '');

  if (localPath) {
    return localPath;
  }

  if (!returnUrl) {
    return '/';
  }

  const decoded = safeDecode(returnUrl);

  try {
    const url = new URL(decoded);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '/';
    }
  } catch {
    return '/';
  }

  return `/login?returnUrl=${encodeURIComponent(decoded)}`;
}

export function getWorkspaceIdFromMultiAccountRoute(
  route: string | null | undefined
) {
  if (!route) {
    return null;
  }

  const path = normalizePersistableMultiAccountRoute(
    route,
    {
      url: 'https://tuturuuu.localhost',
    },
    null
  );

  if (!path) {
    return null;
  }

  const segment = getPrimaryRouteSegment(path);

  if (!segment || NON_PERSISTABLE_ROUTE_SEGMENTS.has(segment)) {
    return null;
  }

  return segment;
}
