import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import appConfig from '../../start-bridge.config';
export const calendarMounts = {
  app: 'calendar',
  rootHosts: [],
  basePath: '/calendar',
  ...appConfig.mounts,
} satisfies AppMountConfig;
export function calendarBase(url: URL) {
  const mount = resolveAppBase(url, calendarMounts);
  return mount
    ? createBasePath({ app: 'calendar', basePath: mount.basePath })
    : null;
}

/**
 * A redirect from a subdomain root request into the mount's base path names
 * the apex mount absolutely, so it never resolves against the subdomain.
 */
export function apexMountLocation(
  requestUrl: URL,
  location: string | null,
  mounts: AppMountConfig = calendarMounts
): string | null {
  const mountHost = mounts.mountHosts?.[0];
  const basePath = mounts.basePath;
  if (!location || !mountHost || !basePath) return null;
  const underBase =
    location === basePath ||
    location.startsWith(`${basePath}/`) ||
    location.startsWith(`${basePath}?`);
  if (!underBase) return null;
  const host = requestUrl.host.toLowerCase();
  if (!mounts.rootHosts.some((root) => root.toLowerCase() === host)) {
    return null;
  }
  return new URL(location, `https://${mountHost}`).href;
}
