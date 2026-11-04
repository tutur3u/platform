import { getAppDomainMap } from '@tuturuuu/utils/internal-domains';
import {
  getLaunchableApp,
  getLaunchableAppOrigin,
  LAUNCHABLE_APP_CATEGORIES,
  LAUNCHABLE_APPS,
  type LaunchableApp,
  type LaunchableAppCategory,
  type LaunchableAppSlug,
} from '@tuturuuu/utils/launchable-apps';

export const APP_CATEGORIES = LAUNCHABLE_APP_CATEGORIES;

export type AppCategory = LaunchableAppCategory;
export type GatewayApp = LaunchableApp;
export type GatewayAppSlug = LaunchableAppSlug;

export const GATEWAY_APPS = LAUNCHABLE_APPS;

export function getGatewayApp(slug: string) {
  return getLaunchableApp(slug);
}

/**
 * Thrown in explicit staging mode when an app has no exact staging origin. The
 * gateway fails closed instead of falling back to a production origin.
 */
export class StagingGatewayOriginError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(
      `No exact staging origin is registered for "${slug}" in NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS; staging never falls back to a production origin`
    );
    this.name = 'StagingGatewayOriginError';
    this.slug = slug;
  }
}

export function isStagingGatewayMode() {
  return process.env.NEXT_PUBLIC_TUTURUUU_STAGING === '1';
}

function isProductionAppHostname(hostname: string) {
  return hostname === 'tuturuuu.com' || hostname.endsWith('.tuturuuu.com');
}

export function getGatewayAppOrigin(app: GatewayApp) {
  if (isStagingGatewayMode()) {
    const staging = getAppDomainMap().find(
      (domain) => domain.name === app.slug && domain.requiresExactOrigin
    );
    let origin: URL | null = null;
    try {
      origin = staging ? new URL(staging.url) : null;
    } catch {
      origin = null;
    }
    if (
      !staging ||
      !origin ||
      origin.protocol !== 'https:' ||
      isProductionAppHostname(origin.hostname)
    )
      throw new StagingGatewayOriginError(app.slug);
    return staging.url;
  }
  return getLaunchableAppOrigin(app);
}

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function buildGatewayRedirectUrl({
  app,
  path = [],
  searchParams,
}: {
  app: GatewayApp;
  path?: string[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const url = new URL(getGatewayAppOrigin(app));
  const suffix = path.map((segment) => encodeURIComponent(segment)).join('/');

  if (suffix) {
    url.pathname = `${trimTrailingSlashes(url.pathname)}/${suffix}`;
  }

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  if (!url.searchParams.has('source')) {
    url.searchParams.set('source', 'apps');
  }

  return url.toString();
}
