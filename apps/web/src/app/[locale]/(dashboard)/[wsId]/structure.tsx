'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from '@tuturuuu/icons';
import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
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
import { ActiveTimerIndicator } from '@/components/active-timer-indicator';
import type { NavLink } from '@/components/navigation';
import { PROD_MODE, SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import { useSidebar } from '@/context/sidebar-context';
import { useActiveTimerSession } from '@/hooks/use-active-timer-session';
import { FeedbackButton } from './feedback-button';
import { Nav } from './nav';

interface StructureProps {
  wsId: string;
  workspace: (Workspace & { tier?: WorkspaceProductTier | null }) | null;
  defaultCollapsed: boolean;
  user: WorkspaceUser | null;
  links: (NavLink | null)[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
  disableCreateNewWorkspace?: boolean;
}

export function Structure({
  wsId,
  defaultCollapsed = false,
  user,
  workspace,
  links,
  actions,
  userPopover,
  children,
  disableCreateNewWorkspace = false,
}: StructureProps) {
  const t = useTranslations();
  const pathname = usePathname();

  const { behavior, handleBehaviorChange } = useSidebar();
  const [initialized, setInitialized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Fetch active timer session
  const { data: activeTimerSession } = useActiveTimerSession(wsId);

  useEffect(() => {
    setInitialized(true);
  }, []);

  // Utility function for path matching that respects segment boundaries
  const matchesPath = useCallback(
    (pathname: string, target?: string, hasChildren?: boolean) => {
      if (!target) return false;

      // For items WITH children, use startsWith to match subroutes
      if (hasChildren) {
        return pathname === target || pathname.startsWith(`${target}/`);
      }

      // For items WITHOUT children, use exact matching only
      return pathname === target;
    },
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
    (navLinks: (NavLink | null)[]): boolean => {
      return navLinks.some((child) => {
        const childMatches =
          (child?.href &&
            matchesPath(
              pathname,
              child.href,
              child.children && child.children.length > 0
            )) ||
          child?.aliases?.some((alias) =>
            matchesPath(
              pathname,
              alias,
              child.children && child.children.length > 0
            )
          );

        if (childMatches) {
          return true;
        }

        if (child?.children) {
          return hasActiveChild(child.children);
        }

        return false;
      });
    },
    [pathname, matchesPath]
  );

  // Universal helper function to find active navigation structure
  const findActiveNavigation = useCallback(
    (
      navLinks: (NavLink | null)[],
      currentPath: string
    ): {
      currentLinks: (NavLink | null)[];
      history: (NavLink | null)[][]; // stack of previous levels
      titleHistory: string[];
      direction: 'forward' | 'backward';
    } | null => {
      for (const link of navLinks) {
        if (!link) continue;

        // Depth-first: attempt to resolve deeper levels first
        if (link.children && link.children.length > 0) {
          const deeper = findActiveNavigation(link.children, currentPath);
          if (deeper) {
            return {
              currentLinks: deeper.currentLinks,
              history: [navLinks, ...deeper.history],
              titleHistory: [link.title, ...deeper.titleHistory],
              direction: 'forward' as const,
            };
          }

          // If any descendant leaf matches, open this submenu level
          if (hasActiveChild(link.children)) {
            return {
              currentLinks: link.children,
              history: [navLinks],
              titleHistory: [link.title],
              direction: 'forward' as const,
            };
          }
        }

        // Check if this link should be active based on pathname or aliases
        const linkMatches =
          (link.href &&
            matchesPath(
              currentPath,
              link.href,
              link.children && link.children.length > 0
            )) ||
          link.aliases?.some((alias) =>
            matchesPath(
              currentPath,
              alias,
              link.children && link.children.length > 0
            )
          );

        if (linkMatches && link.children && link.children.length > 0) {
          // Prefer showing submenu when current link matches and has children
          return {
            currentLinks: link.children,
            history: [navLinks],
            titleHistory: [link.title],
            direction: 'forward' as const,
          };
        }
      }
      return null;
    },
    [matchesPath, hasActiveChild]
  );

  const [navState, setNavState] = useState<{
    currentLinks: (NavLink | null)[];
    history: (NavLink | null)[][]; // stack of previous levels
    titleHistory: string[];
    direction: 'forward' | 'backward';
  }>(() => {
    // Universal logic for active navigation - detects submenu structures consistently
    const activeNavigation = findActiveNavigation(links, pathname);

    if (activeNavigation) {
      return activeNavigation;
    }

    // Flatten links with a single child
    const flattenedLinks = links.flatMap((link) =>
      link?.children && link.children.length === 1
        ? [link.children[0] as NavLink]
        : [link]
    );
    return {
      currentLinks: flattenedLinks,
      history: [] as (NavLink | null)[][],
      titleHistory: [],
      direction: 'forward' as const,
    };
  });

  useEffect(() => {
    setNavState((prevState) => {
      // Universal logic for active navigation - detects submenu structures consistently
      const activeNavigation = findActiveNavigation(links, pathname);
      if (activeNavigation) {
        return activeNavigation;
      }

      // Check if we're currently in a submenu and if any of its children still match the current path
      if (prevState.history.length > 0) {
        // Flatten links with a single child
        const flattenedLinks = links.flatMap((link) =>
          link?.children && link.children.length === 1
            ? [link.children[0] as NavLink]
            : [link]
        );
        return {
          currentLinks: flattenedLinks,
          history: [] as (NavLink | null)[][],
          titleHistory: [],
          direction: 'backward',
        };
      }

      // We are at the top level and no submenu is active, do nothing.
      return prevState;
    });
  }, [pathname, links, findActiveNavigation]);

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
      const newHistory = prevState.history.slice(0, -1);
      const previousLevel =
        prevState.history[prevState.history.length - 1] ?? links;
      return {
        currentLinks: previousLevel,
        history: newHistory,
        titleHistory: prevState.titleHistory.slice(0, -1),
        direction: 'backward',
      };
    });
  };

  const isHoverMode = behavior === 'hover';

  // Helper function to check if any dialogs are currently open
  const hasOpenDialogs = useCallback(() => {
    const hasDialogs =
      document.querySelector('[data-state="open"][role="dialog"]') !== null;
    const hasAlertDialogs =
      document.querySelector('[data-state="open"][role="alertdialog"]') !==
      null;
    return hasDialogs || hasAlertDialogs;
  }, []);

  const onMouseEnter = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) {
          setIsCollapsed(false);
        }
      }
    : undefined;

  const onMouseLeave = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) {
          setIsCollapsed(true);
        }
      }
    : undefined;

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;

  /**
   * Remove consecutive nulls to avoid repeated separators in navigation.
   * Also removes leading and trailing nulls.
   */
  const removeConsecutiveNulls = (
    arr: (NavLink | null)[]
  ): (NavLink | null)[] => {
    const withoutConsecutive = arr.reduce<(NavLink | null)[]>(
      (acc, item, index) => {
        // Skip null if previous item was also null
        if (item === null && index > 0 && arr[index - 1] === null) {
          return acc;
        }
        acc.push(item);
        return acc;
      },
      []
    );

    // Remove leading nulls
    while (withoutConsecutive.length > 0 && withoutConsecutive[0] === null) {
      withoutConsecutive.shift();
    }

    // Remove trailing nulls
    while (
      withoutConsecutive.length > 0 &&
      withoutConsecutive[withoutConsecutive.length - 1] === null
    ) {
      withoutConsecutive.pop();
    }

    return withoutConsecutive;
  };

  const getFilteredLinks = (
    linksToFilter: (NavLink | null)[] | undefined
  ): (NavLink | null)[] => {
    const tiers: WorkspaceProductTier[] = ['FREE', 'PLUS', 'PRO', 'ENTERPRISE'];

    const getTierIndex = (tier: WorkspaceProductTier) => tiers.indexOf(tier);

    const filtered = (linksToFilter || []).flatMap((link) => {
      // Preserve null separators
      if (!link) return [null];

      if (link.disabled) return [];
      if (link.disableOnProduction && PROD_MODE) return [];
      if (link.requireRootMember && !isValidTuturuuuEmail(user?.email))
        return [];

      if (link.requireRootWorkspace && !isRootWorkspace) return [];

      // Check tier requirement
      if (link.requiredWorkspaceTier) {
        const currentTier = workspace?.tier || 'FREE';
        const requiredTier = link.requiredWorkspaceTier.requiredTier;

        if (getTierIndex(currentTier) < getTierIndex(requiredTier)) {
          if (link.requiredWorkspaceTier.alwaysShow) {
            return [
              {
                ...link,
                tempDisabled: true,
              },
            ];
          } else {
            // Hide it
            return [];
          }
        }
      }

      if (link.children && link.children.length > 1) {
        const filteredChildren = getFilteredLinks(link.children);
        // Count non-null items to determine if we have actual content
        const hasContent = filteredChildren.some((child) => child !== null);
        if (!hasContent) {
          return [];
        }
        return [
          {
            ...link,
            children: filteredChildren, // Preserve nulls for separators
          },
        ];
      }
      // Flatten links with a single child
      if (link.children && link.children.length === 1) {
        return getFilteredLinks([link.children[0] as NavLink]);
      }

      return [link];
    });

    // Clean up consecutive nulls after filtering
    return removeConsecutiveNulls(filtered);
  };

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
    .filter((l): l is NavLink => Boolean(l))
    .filter(
      (link) =>
        (link.href &&
          matchesPath(
            pathname,
            link.href,
            link.children && link.children.length > 0
          )) ||
        link.aliases?.some((alias) =>
          matchesPath(
            pathname,
            alias,
            link.children && link.children.length > 0
          )
        )
    )
    .sort((a, b) => (b.href?.length || 0) - (a.href?.length || 0));

  const currentLink = matchedLinks?.[0];

  const sidebarHeader = (
    <>
      {isCollapsed || wsId === ROOT_WORKSPACE_ID || (
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
          t={t}
          wsId={wsId}
          hideLeading={isCollapsed}
          localUseQuery={useQuery}
          disableCreateNewWorkspace={disableCreateNewWorkspace}
        />
      </Suspense>
    </>
  );

  const sidebarContent = (
    <div className="relative h-full overflow-hidden">
      {/* Active Timer Indicator */}
      {activeTimerSession && (
        <div className="p-2 pt-0">
          <ActiveTimerIndicator
            wsId={wsId}
            session={activeTimerSession}
            isCollapsed={isCollapsed}
          />
        </div>
      )}

      <div
        key={navState.history.length}
        className={cn(
          'absolute flex h-full min-h-0 w-full flex-col transition-transform duration-300 ease-in-out',
          navState.direction === 'forward'
            ? 'slide-in-from-right animate-in'
            : 'slide-in-from-left animate-in',
          // Adjust top position when timer is active
          activeTimerSession && (!isCollapsed ? 'top-21' : 'top-8')
        )}
      >
        {navState.history.length === 0 ? (
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
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
          </div>
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
      <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      <div className="flex items-center gap-2 break-all font-semibold text-lg">
        {currentLink?.icon && (
          <div className="flex-none">{currentLink.icon}</div>
        )}
        <span className="line-clamp-1">{currentLink?.title}</span>
      </div>
    </>
  );

  if (!initialized) return null;

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
      feedbackButton={<FeedbackButton isCollapsed={isCollapsed} />}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      hideSizeToggle={behavior === 'hover'}
      overlayOnExpand={behavior === 'hover'}
    >
      {children}
    </BaseStructure>
  );
}
