import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

export type SidebarStructureRenderProps = {
  closeOnMobile?: () => void;
  expandSidebar?: () => void;
  isCollapsed: boolean;
  setIsCollapsed?: Dispatch<SetStateAction<boolean>>;
};

export type WorkspaceSelectRenderer = (
  props: SidebarStructureRenderProps
) => ReactNode;

export type NavigationState = {
  currentLinks: (NavLink | null)[];
  direction: 'forward' | 'backward';
  history: (NavLink | null)[][];
  titleHistory: string[];
};

export function matchesPath(
  pathname: string,
  target?: string,
  hasChildren?: boolean
) {
  if (!target) return false;
  if (hasChildren) {
    return pathname === target || pathname.startsWith(`${target}/`);
  }
  return pathname === target;
}

function cleanNavigationSeparators(
  items: (NavLink | null | undefined)[]
): (NavLink | null)[] {
  const result: (NavLink | null)[] = [];

  for (const item of items) {
    if (item === undefined) continue;
    if (!item && (result.length === 0 || result.at(-1) === null)) continue;
    result.push(item);
  }

  while (result.at(-1) === null) result.pop();
  return result;
}

export function getFilteredLinks(
  linksToFilter: (NavLink | null)[] | undefined
): (NavLink | null)[] {
  const filtered = (linksToFilter || []).flatMap((link) => {
    if (!link) return [null];
    if (link.disabled) return [];

    if (link.children && link.children.length > 1) {
      const filteredChildren = getFilteredLinks(link.children);
      if (!filteredChildren.some(Boolean)) return [];
      return [{ ...link, children: filteredChildren }];
    }

    if (link.children && link.children.length === 1) {
      return getFilteredLinks([link.children[0] as NavLink]);
    }

    return [link];
  });

  return cleanNavigationSeparators(filtered);
}

function hasActiveChild(
  navLinks: (NavLink | null)[],
  pathname: string
): boolean {
  return navLinks.some((child) => {
    const childMatches =
      (child?.href &&
        matchesPath(pathname, child.href, Boolean(child.children?.length))) ||
      child?.aliases?.some((alias) =>
        matchesPath(pathname, alias, Boolean(child.children?.length))
      );

    if (childMatches) return true;
    if (child?.children) return hasActiveChild(child.children, pathname);
    return false;
  });
}

export function findActiveNavigation({
  currentPath,
  navLinks,
}: {
  currentPath: string;
  navLinks: (NavLink | null)[];
}): NavigationState | null {
  for (const link of navLinks) {
    if (!link) continue;

    if (link.children?.length) {
      const deeper = findActiveNavigation({
        currentPath,
        navLinks: link.children,
      });
      if (deeper) {
        return {
          currentLinks: deeper.currentLinks,
          direction: 'forward',
          history: [navLinks, ...deeper.history],
          titleHistory: [link.title, ...deeper.titleHistory],
        };
      }

      if (hasActiveChild(link.children, currentPath)) {
        return {
          currentLinks: link.children,
          direction: 'forward',
          history: [navLinks],
          titleHistory: [link.title],
        };
      }
    }

    const linkMatches =
      (link.href &&
        matchesPath(currentPath, link.href, Boolean(link.children?.length))) ||
      link.aliases?.some((alias) =>
        matchesPath(currentPath, alias, Boolean(link.children?.length))
      );

    if (linkMatches && link.children?.length) {
      return {
        currentLinks: link.children,
        direction: 'forward',
        history: [navLinks],
        titleHistory: [link.title],
      };
    }
  }

  return null;
}

export function getNavigationMatches({
  currentLinks,
  pathname,
}: {
  currentLinks: (NavLink | null)[];
  pathname: string;
}) {
  return currentLinks
    .filter((link): link is NavLink => Boolean(link))
    .filter(
      (link) =>
        (link.href &&
          matchesPath(pathname, link.href, Boolean(link.children?.length))) ||
        link.aliases?.some((alias) =>
          matchesPath(pathname, alias, Boolean(link.children?.length))
        )
    )
    .sort((a, b) => (b.href?.length || 0) - (a.href?.length || 0));
}
