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

export function normalizeMultiAccountRedirectPath(
  value: string | null | undefined,
  request: Pick<Request, 'url'>,
  fallback = '/'
) {
  if (!value) {
    return fallback;
  }

  const decoded = safeDecode(value);
  const origin = new URL(request.url).origin;

  if (decoded.startsWith('/') && !decoded.startsWith('//')) {
    const url = new URL(decoded, origin);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  try {
    const url = new URL(decoded);

    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origin
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
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
