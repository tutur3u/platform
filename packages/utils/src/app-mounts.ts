/**
 * Base-path-aware app registry for the one-origin move from
 * `<app>.tuturuuu.com` to `tuturuuu.com/<app>` (step P1 of
 * platform/architecture/one-origin-super-app).
 *
 * An app counts as mounted only when it is listed in
 * `NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS` (see `internal-app-mounts.ts`), the
 * same switch the verify-token flow already uses. With the list empty (the
 * default) every helper here returns today's subdomain URLs unchanged.
 *
 * URLs produced here never end in a trailing slash: the canonical form is
 * `https://tuturuuu.com/tasks`, not `https://tuturuuu.com/tasks/`.
 *
 * Portable: no framework or runtime imports, and no `process` access unless it
 * exists, so Workers without Node compatibility can import it.
 */

/** The shared origin that mounted apps are served under. */
export const SHARED_APP_ORIGIN = 'https://tuturuuu.com';

/**
 * Mount path of every app that may move to the shared origin. Paths are a
 * single segment and never collide with Web's own top-level routes; the same
 * names are reserved as workspace handles.
 */
export const ONE_ORIGIN_APP_BASE_PATHS = {
  apps: '/apps',
  calendar: '/calendar',
  chat: '/chat',
  cms: '/cms',
  contacts: '/contacts',
  drive: '/drive',
  finance: '/finance',
  forms: '/forms',
  inventory: '/inventory',
  learn: '/learn',
  mail: '/mail',
  meet: '/meet',
  mind: '/mind',
  pay: '/pay',
  storefront: '/store',
  tasks: '/tasks',
  teach: '/teach',
  tools: '/tools',
  track: '/track',
} as const;

export type MountableAppName = keyof typeof ONE_ORIGIN_APP_BASE_PATHS;

function readActiveMountsEnv(): string | undefined {
  // Literal access so Next can inline it on the client.
  return typeof process === 'undefined'
    ? undefined
    : process.env.NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS;
}

/** Active mounts from a comma-separated list of app names. */
export function parseActiveAppMounts(
  value: string | undefined = readActiveMountsEnv()
): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isMountableApp(app: string): app is MountableAppName {
  return Object.hasOwn(ONE_ORIGIN_APP_BASE_PATHS, app);
}

/** The app's mount path (for example `/tasks`), or `null` if it never mounts. */
export function getAppBasePath(app: string): string | null {
  return isMountableApp(app) ? ONE_ORIGIN_APP_BASE_PATHS[app] : null;
}

/** Whether the app is mounted on the shared origin right now. */
export function isAppMounted(
  app: string,
  activeMounts: ReadonlySet<string> = parseActiveAppMounts()
): boolean {
  return isMountableApp(app) && activeMounts.has(app);
}

function withoutTrailingSlash(value: string) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

/**
 * The app's production base URL: `https://tuturuuu.com/<base>` when mounted,
 * otherwise `subdomainUrl` (today's `https://<app>.tuturuuu.com`). Never ends
 * in a slash.
 */
export function getAppProductionBaseUrl(
  app: string,
  subdomainUrl: string,
  activeMounts: ReadonlySet<string> = parseActiveAppMounts()
): string {
  const basePath = getAppBasePath(app);
  if (basePath && isAppMounted(app, activeMounts)) {
    return `${SHARED_APP_ORIGIN}${basePath}`;
  }
  return withoutTrailingSlash(subdomainUrl);
}

/**
 * Joins an app base URL and an app-relative path without ever producing a
 * trailing slash: (`https://tuturuuu.com/tasks`, `/`) is
 * `https://tuturuuu.com/tasks`, and (`…/tasks`, `/a/`) is `…/tasks/a`. The
 * query and fragment of `path` are kept.
 */
export function joinAppUrl(baseUrl: string, path = '/'): string {
  const base = withoutTrailingSlash(baseUrl);
  const trimmed = path.trim();
  const queryAt = trimmed.search(/[?#]/u);
  const pathname = queryAt < 0 ? trimmed : trimmed.slice(0, queryAt);
  const suffix = queryAt < 0 ? '' : trimmed.slice(queryAt);
  const normalized = withoutTrailingSlash(
    pathname.startsWith('/') ? pathname : `/${pathname}`
  );
  return `${base}${normalized}${suffix}`;
}

export type MountedAppMatch = {
  app: MountableAppName;
  /** The mount path, e.g. `/tasks`. */
  basePath: string;
  /** The path inside the app, `/` for the app root. */
  appPath: string;
};

function hasSegmentPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Which active mount serves a shared-origin URL, by longest base-path prefix on
 * segment boundaries (`/tasks` matches `/tasks` and `/tasks/x`, never
 * `/tasks-team`; `/meet` never matches `/meet-together`). Returns `null` for
 * any other origin, an inactive app or a path no mount owns (Web's).
 */
export function resolveMountedAppFromUrl(
  value: string | URL,
  activeMounts: ReadonlySet<string> = parseActiveAppMounts()
): MountedAppMatch | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== SHARED_APP_ORIGIN) return null;

  let best: MountedAppMatch | null = null;
  for (const [app, basePath] of Object.entries(ONE_ORIGIN_APP_BASE_PATHS)) {
    if (!activeMounts.has(app) || !hasSegmentPrefix(url.pathname, basePath)) {
      continue;
    }
    if (best && best.basePath.length >= basePath.length) continue;
    best = {
      app: app as MountableAppName,
      basePath,
      appPath: url.pathname.slice(basePath.length) || '/',
    };
  }
  return best;
}
