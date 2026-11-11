import { normalizeBasePath } from '@tuturuuu/start-bridge/base-path';

export const ROOT_MANIFEST_PATH = '/site.webmanifest';
export const MOUNT_MANIFEST_PATH = '/site.mount.webmanifest';

/** App-relative path of the manifest that matches an app base. */
export function manifestPathFor(basePath?: string) {
  return normalizeBasePath(basePath) === ''
    ? ROOT_MANIFEST_PATH
    : MOUNT_MANIFEST_PATH;
}

export interface CalendarSiteUrlInput {
  /** `''` at the Calendar host root, `/calendar` under the web origin. */
  basePath?: string;
  /** Origin that serves Calendar at its host root. */
  rootOrigin: string;
  /** Origin that serves Calendar under the mount path. */
  webOrigin: string;
}

/**
 * Public URLs for one resolved app base. The origin and the base path stay
 * separate so a root host and a mount derive the same set of URLs: the root
 * set is `<rootOrigin>/...`, the mount set `<webOrigin>/calendar/...`.
 */
export function resolveCalendarSiteUrls({
  basePath,
  rootOrigin,
  webOrigin,
}: CalendarSiteUrlInput) {
  const base = normalizeBasePath(basePath);
  const mounted = base !== '';
  const origin = mounted ? webOrigin : rootOrigin;
  const url = `${origin}${base}`;
  return {
    origin,
    basePath: base,
    url,
    ogImage: `${url}/media/logos/og-image.png`,
    manifest: `${url}${manifestPathFor(base)}`,
    icons: {
      icon: `${base}/favicon.ico`,
      apple: `${base}/apple-touch-icon.png`,
    },
  };
}
