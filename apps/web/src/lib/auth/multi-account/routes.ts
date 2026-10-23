const LOCALE_ROUTE_SEGMENTS = new Set(['en', 'vi']);
const NON_PERSISTABLE_ROUTE_SEGMENTS = new Set([
  'add-account',
  'api',
  'auth',
  'login',
  'onboarding',
]);
export const WEB_WORKSPACE_ROUTE_SEGMENTS = new Set([
  'ai',
  'ai-chat',
  'api-keys',
  'billing',
  'calendar',
  'changelog',
  'chat',
  'crawlers',
  'cron',
  'datasets',
  'diet',
  'documents',
  'drive',
  'epm',
  'external-projects',
  'feedback',
  'finance',
  'forms',
  'habits',
  'hive',
  'inquiries',
  'integrations',
  'inventory',
  'link-shortener',
  'members',
  'mail',
  'memories',
  'meet',
  'metrics',
  'mind',
  'mira',
  'models',
  'notes',
  'notifications',
  'personal-journal',
  'pipelines',
  'polls',
  'posts',
  'progress',
  'qr-generator',
  'queues',
  'readings',
  'roles',
  'secrets',
  'settings',
  'sso',
  'tasks',
  'time-tracker',
  'usage',
  'users',
  'whiteboards',
  'workforce',
  'workouts',
  'workspace-setup',
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

function isWorkspaceSegment(segment: string) {
  return (
    segment === 'personal' ||
    segment === 'internal' ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      segment
    )
  );
}

function getWorkspaceHomeFallback(path: string) {
  const [pathname = ''] = path.split(/[?#]/, 1);
  const segments = pathname.split('/').filter(Boolean);
  const locale = LOCALE_ROUTE_SEGMENTS.has(segments[0] ?? '')
    ? segments.shift()
    : undefined;
  const workspaceSegment = segments[0] ?? '';
  const routeSegment = segments[1] ?? '';

  if (
    !routeSegment ||
    !isWorkspaceSegment(workspaceSegment) ||
    WEB_WORKSPACE_ROUTE_SEGMENTS.has(routeSegment)
  ) {
    return null;
  }

  return `/${[locale, workspaceSegment].filter(Boolean).join('/')}`;
}

export function isWebOriginRequest(
  request: Pick<Request, 'headers'>,
  configuredWebOrigin: string
) {
  const requestOrigin = request.headers.get('origin');

  if (!requestOrigin) {
    return false;
  }

  try {
    return (
      new URL(requestOrigin).origin === new URL(configuredWebOrigin).origin
    );
  } catch {
    return false;
  }
}

function toSameOriginPath(value: string, origin: string) {
  if (value.startsWith('/') && !value.startsWith('//')) {
    const url = new URL(value, origin);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith('//') || path.startsWith('/\\') ? null : path;
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origin
    ) {
      const path = `${url.pathname}${url.search}${url.hash}`;
      return path.startsWith('//') || path.startsWith('/\\') ? null : path;
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

  if (getWorkspaceHomeFallback(route)) {
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
 * are non-persistable precisely because they are transient. Mail-only folder
 * workspace routes are still mapped to their workspace home when Web does not
 * own the route.
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

  const targetHome = getWorkspaceHomeFallback(target);
  if (targetHome) {
    return targetHome;
  }

  if (target) {
    return target;
  }

  const lastRoute = normalizeMultiAccountRedirectPath(
    payload.lastRoute,
    request,
    ''
  );
  const lastRouteHome = getWorkspaceHomeFallback(lastRoute);
  if (lastRouteHome && isPersistableMultiAccountRoutePath(lastRouteHome)) {
    return lastRouteHome;
  }

  return (
    normalizePersistableMultiAccountRoute(payload.lastRoute, request, '/') ??
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
