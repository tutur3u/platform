import {
  type AppDomainUrlMatch,
  getAppDomainByUrl,
  getAppDomainMap,
} from './internal-domains';

const LOCALE_SEGMENTS = new Set(['en', 'vi']);

/**
 * Apps actually routed at `tuturuuu.com/<app>`, from the comma-separated
 * `NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS` (read literally so Next inlines it
 * on the client). Empty by default: a mount only counts once the apex routes
 * it, otherwise a login would send a live token to a path nothing serves.
 */
export function getActiveAppMounts(
  value: string | undefined = process.env.NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS
): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  );
}

export type MountedAppVerifyTokenMatch = AppDomainUrlMatch & {
  /** The mount on the platform origin, e.g. `/inventory`. */
  basePath: string;
  /** The platform origin serving the mount. */
  origin: string;
  /** The raw `nextUrl` query value; callers must still normalize it. */
  nextUrl: string | null;
};

/**
 * An active mount's verify-token page served under the platform apex (`https://tuturuuu.com/<app>/verify-token`, optionally with an `en` or
 * `vi` segment before `verify-token`). Only the platform's registered origin
 * and registered internal app names other than the platform that are listed in
 * `activeMounts` qualify; any other URL returns `null`, so subdomain and
 * platform classification is unchanged.
 */
export function getMountedAppVerifyTokenMatch(
  value: string,
  activeMounts: ReadonlySet<string> = getActiveAppMounts()
): MountedAppVerifyTokenMatch | null {
  const platform = getAppDomainByUrl(value);
  if (platform?.kind !== 'internal' || platform.name !== 'platform')
    return null;

  const url = new URL(platform.canonicalUrl);
  const [app, ...rest] = url.pathname.slice(1).split('/');
  const tail =
    rest.length === 2 && LOCALE_SEGMENTS.has(rest[0] ?? '')
      ? rest.slice(1)
      : rest;
  if (
    !app ||
    app === 'platform' ||
    !activeMounts.has(app) ||
    tail.join('/') !== 'verify-token'
  )
    return null;

  const domain = getAppDomainMap().find(
    (entry) => entry.kind === 'internal' && entry.name === app
  );
  if (!domain) return null;

  return {
    ...domain,
    canonicalUrl: url.toString(),
    basePath: `/${app}`,
    origin: url.origin,
    nextUrl: url.searchParams.get('nextUrl'),
  };
}
