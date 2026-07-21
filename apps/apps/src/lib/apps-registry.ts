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

export function getGatewayAppOrigin(app: GatewayApp) {
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
