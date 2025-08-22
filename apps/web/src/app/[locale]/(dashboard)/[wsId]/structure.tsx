'use client';

import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { ArrowLeft } from '@tuturuuu/ui/icons';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { setCookie } from 'cookies-next';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { NavLink } from '@/components/navigation';
import { PROD_MODE, SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import { useSidebar } from '@/context/sidebar-context';
import { Nav } from './nav';

interface MailProps {
  wsId: string;
  workspace: Workspace | null;
  defaultCollapsed: boolean;
  user: WorkspaceUser | null;
  links: (NavLink | null)[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
  disableCreateNewWorkspace: boolean;
}

export function Structure({
  wsId,
  defaultCollapsed = false,
  user,
  links,
  actions,
  userPopover,
  children,
  disableCreateNewWorkspace,
}: MailProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { behavior, handleBehaviorChange } = useSidebar();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Utility function for path matching that respects segment boundaries
  const matchesPath = useCallback(
    (pathname: string, target?: string) =>
      !!target && (pathname === target || pathname.startsWith(`${target}/`)),
    []
  );

  useEffect(() => {
    if (behavior === 'collapsed' || behavior === 'hover') {
      setIsCollapsed(true);
    } else {
      setIsCollapsed(false);
    }
  }, [behavior]);

  // Recursive function to check if any nested child matches the pathname
  const hasActiveChild = useCallback(
    (navLinks: NavLink[]): boolean => {
      return navLinks.some((child) => {
        const childMatches =
          (child?.href && matchesPath(pathname, child.href)) ||
          child?.aliases?.some((alias) => matchesPath(pathname, alias));

        if (childMatches) {
          return true;
        }

        if (child.children) {
          return hasActiveChild(child.children);
        }

        return false;
      });
    },
    [pathname, matchesPath]
  );

  // Universal helper function to find the deepest active navigation structure
  const findDeepestActiveNavigation = useCallback(
    (navLinks: (NavLink | null)[], currentPath: string) => {
      // Recursively search for the deepest active navigation
      const findDeepest = (links: (NavLink | null)[], depth = 0): any => {
        for (const link of links) {
          if (!link) continue;

          // Check if this link or any of its children are active
          if (link.href && matchesPath(pathname, link.href)) {
            if (link.children && link.children.length > 0) {
              // This link is active and has children, go deeper
              const deeper = findDeepest(link.children, depth + 1);
              if (deeper) {
                return {
                  currentLinks: deeper.currentLinks,
                  history: [navLinks, ...deeper.history],
                  titleHistory: [link.title, ...deeper.titleHistory],
                  direction: 'forward' as const,
                };
              }
            }
            // This link is active but no deeper children, return it
            return {
              currentLinks: [link],
              history: [navLinks],
              titleHistory: [link.title],
              direction: 'forward' as const,
            };
          }

          // Check children recursively
          if (link.children && link.children.length > 0) {
            const childResult = findDeepest(link.children, depth + 1);
            if (childResult) {
              return {
                currentLinks: childResult.currentLinks,
                history: [navLinks, ...childResult.history],
                titleHistory: [link.title, ...childResult.titleHistory],
                direction: 'forward' as const,
              };
            }
          }
        }
        return null;
      };

      return findDeepest(navLinks);
    },
    [matchesPath, pathname]
  );



  const [navState, setNavState] = useState<{
    currentLinks: (NavLink | null)[];
    history: (NavLink | null)[][];
    titleHistory: (string | null)[];
    direction: 'forward' | 'backward';
  }>(() => {
      // Universal logic for deeply nested navigation - automatically detects multi-level structures
      const deepNestedNavigation = findDeepestActiveNavigation(links, pathname);
      if (deepNestedNavigation) {
        return deepNestedNavigation;
      }

    // Standard logic for other routes
    for (const link of links) {
      if (link?.children && link.children.length > 0) {
        const isActive = hasActiveChild(link.children);
        if (isActive) {
          return {
            currentLinks: link.children,
            history: [links],
            titleHistory: [link.title],
            direction: 'forward' as const,
          };
        }
      }
    }

    // Flatten links with a single child
    const flattenedLinks = links
      .flatMap((link) =>
        link?.children && link.children.length === 1
          ? [link.children[0] as NavLink]
          : [link]
      )
      .filter(Boolean) as (NavLink | null)[];
    return {
      currentLinks: flattenedLinks,
      history: [],
      titleHistory: [],
      direction: 'forward' as const,
    };
  });

  useEffect(() => {
    setNavState((prevState) => {
      // Universal logic for deeply nested navigation - automatically detects multi-level structures
      const deepNestedNavigation = findDeepestActiveNavigation(links, pathname);
      if (deepNestedNavigation) {
        return deepNestedNavigation;
      }

      // Standard navigation logic for non-time-tracker routes
      // Find if any submenu should be active for the current path.
      for (const link of links) {
        if (link?.children && link.children.length > 0) {
          // Check if this link should be active based on pathname or aliases
          const linkMatches =
            (link.href && matchesPath(pathname, link.href)) ||
            link.aliases?.some((alias) => matchesPath(pathname, alias));

          const isActive = linkMatches || hasActiveChild(link.children);

          if (isActive) {
            // If the active submenu is not the one currently displayed, switch to it.
            if (
              prevState.titleHistory[prevState.titleHistory.length - 1] !==
              link.title
            ) {
              return {
                currentLinks: link.children,
                history: [links],
                titleHistory: [link.title],
                direction: 'forward',
              };
            }

            // We're already in this submenu, but we need to check if we should go deeper
            // Find the specific child that matches the current pathname
            const activeChild = link.children.find(
              (child) =>
                (child.href && matchesPath(pathname, child.href)) ||
                child.aliases?.some((alias) => matchesPath(pathname, alias))
            );

            if (activeChild?.children && activeChild.children.length > 0) {
              return {
                currentLinks: activeChild.children,
                history: [...prevState.history, prevState.currentLinks],
                titleHistory: [...prevState.titleHistory, activeChild.title],
                direction: 'forward',
              };
            }

            // It's the correct submenu, do nothing to the state.
            return prevState;
          }
        }
      }

      // Check if we're currently in a submenu and if any of its children still match the current path
      if (prevState.history.length > 0) {
        const currentParentTitle =
          prevState.titleHistory[prevState.titleHistory.length - 1];

        // Check if we're still in the same submenu context
        if (currentParentTitle && prevState.titleHistory.includes(currentParentTitle)) {
          return prevState;
        }

        const currentParent = links.find(
          (link) => link?.title === prevState.titleHistory[0]
        );

        if (currentParent?.children) {
          const stillActive = hasActiveChild(currentParent.children);
          if (stillActive) {
            // We're still in the same submenu, keep it open
            return prevState;
          }
        }

        // If we are in a submenu, but no submenu link is active for the current path,
        // it means we navigated to a top-level page. Go back to the main menu.
        // Flatten links with a single child
        const flattenedLinks = links
          .flatMap((link) =>
            link?.children && link.children.length === 1
              ? [link.children[0] as NavLink]
              : [link]
          )
          .filter(Boolean) as (NavLink | null)[];
        return {
          currentLinks: flattenedLinks,
          history: [],
          titleHistory: [],
          direction: 'backward',
        };
      }

      // We are at the top level and no submenu is active, do nothing.
      return prevState;
    });
  }, [pathname, links, hasActiveChild, matchesPath, findDeepestActiveNavigation]);

  const handleToggle = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    setCookie(SIDEBAR_COLLAPSED_COOKIE_NAME, newCollapsed);

    if (behavior === 'expanded' && newCollapsed) {
      handleBehaviorChange('collapsed');
    } else if (behavior === 'collapsed' && !newCollapsed) {
      handleBehaviorChange('expanded');
    }
  };

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
      const previousLinks = prevState.history[prevState.history.length - 1];
      return {
        currentLinks: previousLinks || links,
        history: prevState.history.slice(0, -1),
        titleHistory: prevState.titleHistory.slice(0, -1),
        direction: 'backward',
      };
    });
  };

  const isHoverMode = behavior === 'hover';
  const onMouseEnter = isHoverMode ? () => setIsCollapsed(false) : undefined;
  const onMouseLeave = isHoverMode ? () => setIsCollapsed(true) : undefined;

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;

  const getFilteredLinks = (
    linksToFilter: (NavLink | null)[] | undefined
  ): NavLink[] =>
    (linksToFilter || []).flatMap((link) => {
      if (!link) return [];

      if (link.disabled) return [];
      if (link.disableOnProduction && PROD_MODE) return [];
      if (link.requireRootMember && !user?.email?.endsWith('@tuturuuu.com'))
        return [];
      if (link.requireRootWorkspace && !isRootWorkspace) return [];
      // TODO: Implement role-based filtering when user roles are available
      // if (link.allowedRoles?.length) {
      //   const hasRole = user?.roles?.some((r) => link.allowedRoles!.includes(r));
      //   if (!hasRole) return [];
      // }

      // For navigation items with children, always include them
      if (link.children && link.children.length > 0) {
        const filteredChildren = getFilteredLinks(link.children);
        if (filteredChildren.length === 0) {
          return [];
        }
        return [{ ...link, children: filteredChildren }];
      }

      return [link];
    });

  const backButton: NavLink = {
    title: t('common.back'),
    icon: <ArrowLeft className="h-4 w-4" />,
    onClick: handleNavBack,
    isBack: true,
  };

  const currentTitle = navState.titleHistory[navState.titleHistory.length - 1];
  const filteredCurrentLinks = getFilteredLinks(navState.currentLinks);

  const matchedLinks = (
    navState.history.length > 0
      ? [backButton, ...filteredCurrentLinks]
      : filteredCurrentLinks
  )
    .filter(
      (link) =>
        (link.href && matchesPath(pathname, link.href)) ||
        link.aliases?.some((alias) => matchesPath(pathname, alias))
    )
    .sort((a, b) => {
      const aLength = a.href ? a.href.length : a.aliases?.[0]?.length || 0;
      const bLength = b.href ? b.href.length : b.aliases?.[0]?.length || 0;
      return bLength - aLength;
    });

  const currentLink = matchedLinks?.[0];

  const sidebarHeader = (
    <>
      {isCollapsed || (
        <Link href="/home" className="flex flex-none items-center gap-2">
          <div className="flex-none">
            <Image
              src="/media/logos/transparent.png"
              className="h-6 w-6"
              width={32}
              height={32}
              alt="logo"
            />
          </div>
          <LogoTitle />
        </Link>
      )}

      <Suspense
        key={user?.id}
        fallback={
          <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
        }
      >
        <WorkspaceSelect
          t={t as (key: string) => string}
          hideLeading={isCollapsed}
          localUseQuery={useQuery}
          disableCreateNewWorkspace={disableCreateNewWorkspace}
        />
      </Suspense>
    </>
  );

  const sidebarContent = (
    <div className="relative h-full overflow-hidden">
      <div
        key={navState.history.length}
        className={cn(
          'absolute flex h-full w-full flex-col transition-transform duration-300 ease-in-out',
          navState.direction === 'forward'
            ? 'slide-in-from-right animate-in'
            : 'slide-in-from-left animate-in'
        )}
      >
        {navState.history.length === 0 ? (
          <Nav
            key={`${user?.id}-root`}
            wsId={wsId}
            isCollapsed={isCollapsed}
            links={filteredCurrentLinks}
            onSubMenuClick={handleNavChange}
            onClick={() => {
              if (window.innerWidth < 768) {
                setIsCollapsed(true);
              }
            }}
          />
        ) : (
          <>
            <Nav
              key={`${user?.id}-back`}
              wsId={wsId}
              isCollapsed={isCollapsed}
              links={[backButton]}
              onSubMenuClick={handleNavChange}
              onClick={() => {
                /* For the back button, we don't want to close the sidebar */
              }}
            />
            {!isCollapsed && currentTitle && (
              <div className="p-2 pt-0">
                <h2 className="line-clamp-1 px-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                  {currentTitle}
                </h2>
              </div>
            )}
            {!isCollapsed && <div className="mx-4 my-1 border-b" />}
            {filteredCurrentLinks.length > 0 && (
              <div className="scrollbar-none flex-1 overflow-y-auto">
                <Nav
                  key={`${user?.id}-nav`}
                  wsId={wsId}
                  isCollapsed={isCollapsed}
                  links={filteredCurrentLinks}
                  onSubMenuClick={handleNavChange}
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      setIsCollapsed(true);
                    }
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const header = null;

  const mobileHeader = (
    <>
      <div className="flex flex-none items-center gap-2">
        <Link href="/home" className="flex flex-none items-center gap-2">
          <Image
            src="/media/logos/transparent.png"
            className="h-8 w-8"
            width={32}
            height={32}
            alt="logo"
          />
        </Link>
      </div>
      <div className="mx-2 h-4 w-px flex-none rotate-[30deg] bg-foreground/20" />
      <div className="flex items-center gap-2 break-all font-semibold text-lg">
        {currentLink?.icon && (
          <div className="flex-none">{currentLink.icon}</div>
        )}
        <span className="line-clamp-1">{currentLink?.title}</span>
      </div>
    </>
  );

  return (
    <BaseStructure
      isCollapsed={isCollapsed}
      setIsCollapsed={handleToggle}
      header={header}
      mobileHeader={mobileHeader}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      actions={actions}
      userPopover={userPopover}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      hideSizeToggle={behavior === 'hover'}
    >
      {children}
    </BaseStructure>
  );
}
