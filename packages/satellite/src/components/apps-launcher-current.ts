import {
  getLaunchableAppByHostname,
  getLaunchableAppOrigin,
  LAUNCHABLE_APPS,
} from '@tuturuuu/utils/launchable-apps';

function trimTrailingSlash(path: string) {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Resolves the launchable app serving `href`. An app matches when its origin
 * equals the page origin and its mount path (if any) prefixes the page path;
 * the longest mount path wins so mounted apps beat the shared root app.
 */
export function getCurrentLaunchableAppSlug(href: string | undefined) {
  if (!href) return undefined;

  let page: URL;
  try {
    page = new URL(href);
  } catch {
    return undefined;
  }

  let best: { pathLength: number; slug: string } | undefined;
  for (const app of LAUNCHABLE_APPS) {
    let base: URL;
    try {
      base = new URL(
        getLaunchableAppOrigin(app, { currentOrigin: page.origin })
      );
    } catch {
      continue;
    }
    if (base.origin !== page.origin) continue;

    const basePath = trimTrailingSlash(base.pathname);
    if (
      basePath &&
      page.pathname !== basePath &&
      !page.pathname.startsWith(`${basePath}/`)
    ) {
      continue;
    }
    if (!best || basePath.length > best.pathLength) {
      best = { pathLength: basePath.length, slug: app.slug };
    }
  }

  return best?.slug ?? getLaunchableAppByHostname(page.host)?.slug;
}
