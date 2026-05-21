'use client';

import { ArrowLeft } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  flattenSingleChildLinks,
  getFilteredLinks,
  matchesPath,
} from './structure-navigation-utils';

export interface StructureNavigationState {
  currentLinks: (NavLink | null)[];
  history: (NavLink | null)[][];
  titleHistory: string[];
  direction: 'forward' | 'backward';
}

export function useStructureNavigation(
  links: (NavLink | null)[],
  backTitle: string
) {
  const pathname = usePathname();

  const hasActiveChild = useCallback(
    (navLinks: (NavLink | null)[]): boolean =>
      navLinks.some((child) => {
        const childMatches =
          (child?.href &&
            matchesPath(
              pathname,
              child.href,
              Boolean(child.children?.length)
            )) ||
          child?.aliases?.some((alias) =>
            matchesPath(pathname, alias, Boolean(child.children?.length))
          );

        return (
          childMatches ||
          Boolean(child?.children && hasActiveChild(child.children))
        );
      }),
    [pathname]
  );

  const findActiveNavigation = useCallback(
    (
      navLinks: (NavLink | null)[],
      currentPath: string
    ): StructureNavigationState | null => {
      for (const link of navLinks) {
        if (!link) continue;

        if (link.children?.length) {
          const deeper = findActiveNavigation(link.children, currentPath);
          if (deeper) {
            return {
              currentLinks: deeper.currentLinks,
              history: [navLinks, ...deeper.history],
              titleHistory: [link.title, ...deeper.titleHistory],
              direction: 'forward',
            };
          }

          if (hasActiveChild(link.children)) {
            return {
              currentLinks: link.children,
              history: [navLinks],
              titleHistory: [link.title],
              direction: 'forward',
            };
          }
        }

        const linkMatches =
          (link.href &&
            matchesPath(
              currentPath,
              link.href,
              Boolean(link.children?.length)
            )) ||
          link.aliases?.some((alias) =>
            matchesPath(currentPath, alias, Boolean(link.children?.length))
          );

        if (linkMatches && link.children?.length) {
          return {
            currentLinks: link.children,
            history: [navLinks],
            titleHistory: [link.title],
            direction: 'forward',
          };
        }
      }

      return null;
    },
    [hasActiveChild]
  );

  const [navState, setNavState] = useState<StructureNavigationState>(() => {
    const activeNavigation = findActiveNavigation(links, pathname);
    return (
      activeNavigation ?? {
        currentLinks: flattenSingleChildLinks(links),
        history: [],
        titleHistory: [],
        direction: 'forward',
      }
    );
  });

  useEffect(() => {
    setNavState((prevState) => {
      const activeNavigation = findActiveNavigation(links, pathname);
      if (activeNavigation) return activeNavigation;
      if (prevState.history.length === 0) return prevState;

      return {
        currentLinks: flattenSingleChildLinks(links),
        history: [],
        titleHistory: [],
        direction: 'backward',
      };
    });
  }, [pathname, links, findActiveNavigation]);

  const handleNavChange = (
    newLinks: (NavLink | null)[],
    parentTitle: string
  ) => {
    setNavState((prevState) => ({
      currentLinks: newLinks,
      history: [...prevState.history, prevState.currentLinks],
      titleHistory: [...prevState.titleHistory, parentTitle],
      direction: 'forward',
    }));
  };

  const handleNavBack = () => {
    setNavState((prevState) => {
      const previousLevel = prevState.history.at(-1) ?? links;
      return {
        currentLinks: previousLevel,
        history: prevState.history.slice(0, -1),
        titleHistory: prevState.titleHistory.slice(0, -1),
        direction: 'backward',
      };
    });
  };

  const filteredCurrentLinks = getFilteredLinks(navState.currentLinks);
  const backButton: NavLink = {
    title: backTitle,
    icon: <ArrowLeft className="h-4 w-4" />,
    onClick: handleNavBack,
    isBack: true,
  };
  const activeCandidates: (NavLink | null)[] =
    navState.history.length > 0
      ? [backButton, ...filteredCurrentLinks]
      : filteredCurrentLinks;

  const currentLink = activeCandidates
    .filter((link): link is NavLink => Boolean(link))
    .filter(
      (link) =>
        (link.href &&
          matchesPath(pathname, link.href, Boolean(link.children?.length))) ||
        link.aliases?.some((alias) =>
          matchesPath(pathname, alias, Boolean(link.children?.length))
        )
    )
    .sort((a, b) => (b.href?.length || 0) - (a.href?.length || 0))[0];

  return {
    backButton,
    currentLink,
    currentTitle: navState.titleHistory.at(-1),
    filteredCurrentLinks,
    handleNavChange,
    navState,
    pathname,
  };
}
