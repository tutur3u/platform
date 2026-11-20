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

export const GATEWAY_SEARCH_HEADER = 'x-tuturuuu-gateway-search';

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
  search,
}: {
  app: GatewayApp;
  path?: string[];
  search: string;
}) {
  const url = new URL(getGatewayAppOrigin(app));
  const suffix = path.map((segment) => encodeURIComponent(segment)).join('/');

  if (suffix) {
    url.pathname = `${trimTrailingSlashes(url.pathname)}/${suffix}`;
  }

  url.search = search;
  if (!url.searchParams.has('source')) {
    url.search = search ? `${search}&source=apps` : '?source=apps';
  }

  return url.toString();
}
