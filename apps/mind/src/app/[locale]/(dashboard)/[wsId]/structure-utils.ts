import type { NavLink } from '@tuturuuu/ui/custom/navigation';

function matchesPath(pathname: string, target?: string, matchExact?: boolean) {
  if (!target) return false;
  if (matchExact) return pathname === target;
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function filterLinks(links: (NavLink | null)[]): (NavLink | null)[] {
  const filtered = links.flatMap((link) => {
    if (!link) return [null];
    if (link.disabled) return [];
    if (!link.children?.length) return [link];

    const children = filterLinks(link.children);
    if (!children.some(Boolean)) return [];
    return children.length === 1 ? children : [{ ...link, children }];
  });

  return filtered.reduce<(NavLink | null)[]>((acc, link) => {
    if (link === null && (acc.length === 0 || acc.at(-1) === null)) {
      return acc;
    }
    acc.push(link);
    return acc;
  }, []);
}

export function findActiveLink(links: (NavLink | null)[], pathname: string) {
  const matches: NavLink[] = [];

  for (const link of links) {
    if (!link) continue;
    if (
      matchesPath(pathname, link.href, link.matchExact) ||
      link.aliases?.some((alias) => matchesPath(pathname, alias))
    ) {
      matches.push(link);
    }
    if (link.children?.length) {
      const child = findActiveLink(link.children, pathname);
      if (child) matches.push(child);
    }
  }

  return (
    matches.sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0))[0] ??
    null
  );
}
