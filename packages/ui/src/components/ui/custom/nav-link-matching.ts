import type { NavLink } from './navigation';

export function matchesPathPrefix(targetPath: string, pathPrefix: string) {
  return targetPath === pathPrefix || targetPath.startsWith(`${pathPrefix}/`);
}

function isAbsoluteHttpUrl(target: string) {
  return /^https?:\/\//iu.test(target);
}

export function getComparablePath(
  target?: string,
  options: { external?: boolean } = {}
) {
  if (!target) return null;
  if (options.external) return null;

  try {
    const base =
      typeof window === 'undefined'
        ? 'https://tuturuuu.local'
        : window.location.origin;
    const url = isAbsoluteHttpUrl(target)
      ? new URL(target)
      : new URL(target, base);

    if (url.origin !== base) return null;

    return url.pathname;
  } catch {
    return target.split(/[?#]/u)[0] || target;
  }
}

export function matchesNavigationTarget(
  pathname: string,
  target: string,
  matchExact = false
) {
  const isWildcard = target.endsWith('/*');
  const normalizedTarget = isWildcard
    ? target.slice(0, -2).replace(/\/+$/u, '') || '/'
    : target;

  if (isWildcard) return matchesPathPrefix(pathname, normalizedTarget);

  return matchExact
    ? pathname === normalizedTarget
    : matchesPathPrefix(pathname, normalizedTarget);
}

function hasActiveChild(
  navLinks: (NavLink | null)[],
  pathname: string
): boolean {
  return (
    navLinks?.some((child) => {
      const childTargets = [child?.href, ...(child?.aliases ?? [])]
        .map((target) =>
          getComparablePath(target, { external: child?.external })
        )
        .filter((target): target is string => Boolean(target));
      const childMatches = childTargets.some((target) =>
        matchesNavigationTarget(pathname, target, child?.matchExact)
      );

      if (childMatches) return true;

      if (child?.children) {
        return hasActiveChild(child.children, pathname);
      }

      return false;
    }) ?? false
  );
}

/** Whether the link, one of its aliases, or any nested child matches the path. */
export function isNavLinkActive(link: NavLink, pathname: string): boolean {
  const activeTargets = [link.href, ...(link.aliases ?? [])]
    .map((target) => getComparablePath(target, { external: link.external }))
    .filter((target): target is string => Boolean(target));

  return (
    activeTargets.some((target) =>
      matchesNavigationTarget(pathname, target, link.matchExact)
    ) || (link.children ? hasActiveChild(link.children, pathname) : false)
  );
}
