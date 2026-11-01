import { isStagingAppOrigin } from '@tuturuuu/utils/staging-hosts';

interface SatelliteApiRewriteOptions {
  calendarAppOrigin: string;
  infrastructureAppOrigin: string;
}

function withoutTrailingSlash(origin: string) {
  return origin.replace(/\/+$/, '');
}

/**
 * A staging Web build (NEXT_PUBLIC_TUTURUUU_STAGING=1) may rewrite only to
 * exact registered HTTPS staging app origins, never into the production
 * zone. Throws at config time so the staging build fails instead of
 * forwarding staging sessions to production satellites.
 */
export function assertStagingRewriteOrigins(
  origins: SatelliteApiRewriteOptions,
  env: Record<string, string | undefined> = process.env
) {
  if (env.NEXT_PUBLIC_TUTURUUU_STAGING !== '1') return;
  for (const [name, value] of Object.entries(origins)) {
    const invalid = new Error(
      `Staging Web rewrite ${name} must be an exact https://<app>.tutur3u.com origin`
    );
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw invalid;
    }
    const host = url.hostname;
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      withoutTrailingSlash(url.href) !== url.origin ||
      host === 'tuturuuu.com' ||
      host.endsWith('.tuturuuu.com') ||
      !isStagingAppOrigin(url.origin)
    )
      throw invalid;
  }
}

export function createSatelliteApiRewrites(
  { calendarAppOrigin, infrastructureAppOrigin }: SatelliteApiRewriteOptions,
  env: Record<string, string | undefined> = process.env
) {
  assertStagingRewriteOrigins(
    { calendarAppOrigin, infrastructureAppOrigin },
    env
  );
  const calendarOrigin = withoutTrailingSlash(calendarAppOrigin);
  const infrastructureOrigin = withoutTrailingSlash(infrastructureAppOrigin);

  return [
    {
      source: '/api/v1/infrastructure/ai/models',
      destination: `${infrastructureOrigin}/api/v1/infrastructure/ai/models`,
    },
    {
      source: '/api/v1/infrastructure/resolve-workspace-id',
      destination: `${infrastructureOrigin}/api/v1/infrastructure/resolve-workspace-id`,
    },
    {
      source: '/api/v1/workspaces/:wsId/calendar/events',
      destination: `${calendarOrigin}/api/v1/workspaces/:wsId/calendar/events`,
    },
    {
      source: '/api/v1/workspaces/:wsId/calendar/events/:eventId',
      destination: `${calendarOrigin}/api/v1/workspaces/:wsId/calendar/events/:eventId`,
    },
  ];
}
