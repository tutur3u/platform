'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppsLauncherDialog } from '@tuturuuu/satellite';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import {
  TUTURUUU_LOCAL_LOGO_URL,
  TuturuuLogo,
} from '@tuturuuu/ui/custom/tuturuuu-logo';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import type { LaunchableWorkspace } from '@tuturuuu/utils/launchable-apps';
import { setCookie } from 'cookies-next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PROD_MODE } from '@/constants/env';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/sidebar';
import { getSidebarCookieOptions, useSidebar } from '@/context/sidebar-context';
import {
  useRecentSidebarItemsComponent,
  useSidebarActiveTimerComponent,
} from './lazy-sidebar-components';
import { Nav } from './nav';
import {
  type DashboardNavigationLink,
  isDashboardNavigationIconDescriptor,
} from './navigation-icon-descriptor';
import { DashboardNavigationIcon } from './navigation-icons';
import { filterDashboardNavigationLinks } from './navigation-visibility';
import {
  applySidebarNavigationPreferences,
  createSidebarNavigationLayoutConfigForHiddenState,
  createSidebarNavigationLayoutConfigForPlacement,
  MORE_TOOLS_NAVIGATION_ID,
  promoteArchivedWhenMoreToolsOnlyHasArchive,
  SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
  SIDEBAR_RECENT_NAVIGATION_ENABLED_CONFIG_ID,
  type SidebarNavigationPlacement,
  serializeSidebarNavigationLayoutConfig,
} from './sidebar-navigation-preferences';
import type { NavigationState, StructureProps } from './structure-types';

const WorkspaceSelect = dynamic(
  () => import('./workspace-select').then((module) => module.WorkspaceSelect),
  {
    loading: () => (
      <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
    ),
    ssr: false,
  }
);

function getNavigationLinksSignature(links: (NavLink | null)[]): string {
  return links
    .map((link) => {
      if (!link) return 'separator';

      return [
        link.id ?? '',
        link.href ?? '',
        link.title,
        link.children ? getNavigationLinksSignature(link.children) : '',
        link.preferenceArchivedItems
          ?.map((item) => item.id ?? item.title)
          .join(',') ?? '',
      ].join(':');
    })
    .join('|');
}

function getNavigationStateSignature(state: {
  currentLinks: (NavLink | null)[];
  history: (NavLink | null)[][];
  titleHistory: string[];
  direction: 'forward' | 'backward';
}) {
  return [
    getNavigationLinksSignature(state.currentLinks),
    state.history.map(getNavigationLinksSignature).join('>'),
    state.titleHistory.join('>'),
    state.direction,
  ].join('::');
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

  while (result.at(-1) === null) {
    result.pop();
  }

  return result;
}

function getNavigationChildCount(link: NavLink | null | undefined) {
  return link?.children?.filter(Boolean).length ?? 0;
}

function hasMultipleNavigationChildren(link: NavLink | null | undefined) {
  return getNavigationChildCount(link) > 1;
}

function insertArchivedNavigationLink({
  archivedNavigationLink,
  children,
}: {
  archivedNavigationLink: NavLink;
  children: (NavLink | null)[];
}): (NavLink | null)[] {
  if (!children.some(Boolean)) return [archivedNavigationLink];

  return cleanNavigationSeparators([...children, null, archivedNavigationLink]);
}

function hydrateDashboardNavigationLink(
  link: DashboardNavigationLink
): NavLink {
  const icon = isDashboardNavigationIconDescriptor(link.icon) ? (
    <DashboardNavigationIcon
      className={link.icon.className}
      name={link.icon.name}
    />
  ) : (
    link.icon
  );

  return {
    ...link,
    icon,
    children: link.children
      ? hydrateDashboardNavigationIcons(link.children)
      : undefined,
    preferenceArchivedItems: link.preferenceArchivedItems?.map(
      hydrateDashboardNavigationLink
    ),
  };
}

function hydrateDashboardNavigationIcons(
  links: (DashboardNavigationLink | null)[]
): (NavLink | null)[] {
  return links.map((link) =>
    link ? hydrateDashboardNavigationLink(link) : null
  );
}

function findNavigationByTitleHistory({
  direction,
  links,
  titleHistory,
}: {
  direction: 'forward' | 'backward';
  links: (NavLink | null)[];
  titleHistory: string[];
}) {
  if (titleHistory.length === 0) return null;

  const history: (NavLink | null)[][] = [];
  let currentLinks = links;

  for (const title of titleHistory) {
    const parentLink = currentLinks.find(
      (link) => link?.title === title && hasMultipleNavigationChildren(link)
    );

    if (!parentLink?.children) return null;

    history.push(currentLinks);
    currentLinks = parentLink.children;
  }

  return {
    currentLinks,
    history,
    titleHistory,
    direction,
  };
}

async function loadUserConfig(
  configId: string,
  defaultValue: string | null = null
) {
  const { getUserConfig } = await import('@tuturuuu/internal-api/users');
  const response = await getUserConfig(configId);

  return (response.value as string | null) ?? defaultValue;
}

async function loadUserWorkspaceConfig(wsId: string, configId: string) {
  const { getUserWorkspaceConfig } = await import(
    '@tuturuuu/internal-api/users'
  );
  const response = await getUserWorkspaceConfig(wsId, configId);

  return response.value;
}

async function updateWorkspaceNavigationLayoutConfig(
  wsId: string,
  value: string
) {
  const { updateUserWorkspaceConfig } = await import(
    '@tuturuuu/internal-api/users'
  );

  await updateUserWorkspaceConfig(
    wsId,
    SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
    value
  );
}

function showSidebarLayoutQuickUpdateError(message: string) {
  void import('@tuturuuu/ui/sonner').then(({ toast }) => {
    toast.error(message);
  });
}

export function StructureImpl({
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
  const queryClient = useQueryClient();

  const { behavior, handleBehaviorChange } = useSidebar();
  const [initialized, setInitialized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
  const SidebarActiveTimer = useSidebarActiveTimerComponent();
  const hydratedLinks = useMemo(
    () => hydrateDashboardNavigationIcons(links),
    [links]
  );
  const appsLauncherLink = useMemo<NavLink>(
    () => ({
      icon: <DashboardNavigationIcon className="h-4 w-4" name="Boxes" />,
      id: 'apps-launcher',
      onClick: () => setAppsLauncherOpen(true),
      preferenceLocked: true,
      preferencePlacement: 'root',
      title: t('command_launcher.apps'),
    }),
    [t]
  );
  const navigationLinksWithLauncher = useMemo<(NavLink | null)[]>(
    () => cleanNavigationSeparators([appsLauncherLink, null, ...hydratedLinks]),
    [appsLauncherLink, hydratedLinks]
  );
  const previousPathnameRef = useRef(pathname);
  const accountNavigationLayoutQueryKey = [
    'user-config',
    SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
  ] as const;
  const workspaceNavigationLayoutQueryKey = [
    'user-workspace-config',
    wsId,
    SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID,
  ] as const;
  const { data: accountNavigationLayout } = useQuery({
    queryKey: accountNavigationLayoutQueryKey,
    queryFn: () => loadUserConfig(SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID),
    staleTime: 5 * 60 * 1000,
  });
  const { data: workspaceNavigationLayout } = useQuery({
    queryKey: workspaceNavigationLayoutQueryKey,
    queryFn: () =>
      loadUserWorkspaceConfig(wsId, SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID),
    enabled: Boolean(wsId),
    staleTime: 5 * 60 * 1000,
  });
  const { data: recentNavigationValue } = useQuery({
    queryKey: [
      'user-config',
      SIDEBAR_RECENT_NAVIGATION_ENABLED_CONFIG_ID,
    ] as const,
    queryFn: () =>
      loadUserConfig(SIDEBAR_RECENT_NAVIGATION_ENABLED_CONFIG_ID, 'false'),
    staleTime: 5 * 60 * 1000,
  });
  const recentNavigationEnabled = recentNavigationValue === 'true';
  const RecentSidebarItems = useRecentSidebarItemsComponent(
    recentNavigationEnabled
  );
  const effectiveNavigationLayout =
    workspaceNavigationLayout ?? accountNavigationLayout ?? null;
  const navigationPreferenceResult = useMemo(
    () =>
      applySidebarNavigationPreferences(
        navigationLinksWithLauncher,
        effectiveNavigationLayout,
        {
          pathname,
        }
      ),
    [effectiveNavigationLayout, navigationLinksWithLauncher, pathname]
  );
  const preferenceItemById = useMemo(
    () =>
      new Map(navigationPreferenceResult.items.map((item) => [item.id, item])),
    [navigationPreferenceResult.items]
  );
  const quickLayoutMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      await updateWorkspaceNavigationLayoutConfig(wsId, value);

      return { id, value };
    },
    onMutate: async ({ value }) => {
      await queryClient.cancelQueries({
        queryKey: workspaceNavigationLayoutQueryKey,
      });
      const previousValue = queryClient.getQueryData<string | null>(
        workspaceNavigationLayoutQueryKey
      );
      queryClient.setQueryData(workspaceNavigationLayoutQueryKey, value);

      return { previousValue };
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(
          workspaceNavigationLayoutQueryKey,
          context.previousValue
        );
      }
      showSidebarLayoutQuickUpdateError(
        t('settings.preferences.sidebar_layout.quick_update_error')
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceNavigationLayoutQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: accountNavigationLayoutQueryKey,
      });
    },
  });
  const createQuickPlacementUpdate = useCallback(
    (id: string, placement: SidebarNavigationPlacement) => {
      const nextConfig = createSidebarNavigationLayoutConfigForPlacement(
        navigationLinksWithLauncher,
        effectiveNavigationLayout,
        id,
        placement
      );

      return {
        id,
        placement,
        value: serializeSidebarNavigationLayoutConfig(nextConfig),
      };
    },
    [effectiveNavigationLayout, navigationLinksWithLauncher]
  );
  const createQuickHiddenUpdate = useCallback(
    (id: string, hidden: boolean) => {
      const nextConfig = createSidebarNavigationLayoutConfigForHiddenState(
        navigationLinksWithLauncher,
        effectiveNavigationLayout,
        id,
        hidden
      );

      return {
        id,
        value: serializeSidebarNavigationLayoutConfig(nextConfig),
      };
    },
    [effectiveNavigationLayout, navigationLinksWithLauncher]
  );
  const preferredLinks = useMemo(() => {
    if (navigationPreferenceResult.archivedLinks.length === 0) {
      return navigationPreferenceResult.links;
    }

    const archivedNavigationLink: NavLink = {
      id: 'archived_navigation',
      title: t('settings.preferences.sidebar_layout.archived_title'),
      icon: <DashboardNavigationIcon className="h-5 w-5" name="Archive" />,
      preferenceArchivedItems: navigationPreferenceResult.archivedLinks.map(
        (archivedLink) => ({
          ...archivedLink,
          children: undefined,
        })
      ),
    };

    return navigationPreferenceResult.links.map((link) => {
      if (link?.id !== MORE_TOOLS_NAVIGATION_ID) return link;

      return {
        ...link,
        children: insertArchivedNavigationLink({
          archivedNavigationLink,
          children: link.children ?? [],
        }),
      };
    });
  }, [
    navigationPreferenceResult.archivedLinks,
    navigationPreferenceResult.links,
    t,
  ]);
  const decoratePreferenceActions = useCallback(
    (linksToDecorate: (NavLink | null)[]): (NavLink | null)[] =>
      linksToDecorate.map((link) => {
        if (!link) return null;

        if (link.id === MORE_TOOLS_NAVIGATION_ID) {
          return {
            ...link,
            children: link.children,
          };
        }

        const archivedItems = link.preferenceArchivedItems?.map((item) => ({
          ...item,
          preferenceArchiveAction: item.id
            ? {
                isArchived: true,
                label: t('settings.preferences.sidebar_layout.unarchive_item', {
                  item: item.title,
                }),
                onClick: () =>
                  quickLayoutMutation.mutate(
                    createQuickHiddenUpdate(item.id!, false)
                  ),
                pending:
                  quickLayoutMutation.isPending &&
                  quickLayoutMutation.variables?.id === item.id,
              }
            : undefined,
        }));
        const preferenceItem = link.id ? preferenceItemById.get(link.id) : null;
        if (!link.id || !preferenceItem || preferenceItem.locked) {
          return archivedItems
            ? { ...link, preferenceArchivedItems: archivedItems }
            : link;
        }

        const isPinned = preferenceItem.placement === 'root';
        const nextPlacement: SidebarNavigationPlacement = isPinned
          ? 'more'
          : 'root';
        const pending =
          quickLayoutMutation.isPending &&
          quickLayoutMutation.variables?.id === link.id;

        return {
          ...link,
          preferenceArchivedItems: archivedItems,
          preferenceArchiveAction: {
            isArchived: preferenceItem.hidden,
            label: preferenceItem.hidden
              ? t('settings.preferences.sidebar_layout.unarchive_item', {
                  item: link.title,
                })
              : t('settings.preferences.sidebar_layout.archive_item', {
                  item: link.title,
                }),
            onClick: () =>
              quickLayoutMutation.mutate(
                createQuickHiddenUpdate(link.id!, !preferenceItem.hidden)
              ),
            pending,
          },
          preferenceQuickAction: {
            isPinned,
            label: isPinned
              ? t('settings.preferences.sidebar_layout.unpin_to_more')
              : t('settings.preferences.sidebar_layout.pin_to_root'),
            onClick: () =>
              quickLayoutMutation.mutate(
                createQuickPlacementUpdate(link.id!, nextPlacement)
              ),
            pending,
          },
        };
      }),
    [
      createQuickHiddenUpdate,
      createQuickPlacementUpdate,
      preferenceItemById,
      quickLayoutMutation.isPending,
      quickLayoutMutation.mutate,
      quickLayoutMutation.variables?.id,
      t,
    ]
  );
  const getFilteredLinks = useCallback(
    (linksToFilter: (NavLink | null)[] | undefined): (NavLink | null)[] =>
      filterDashboardNavigationLinks(linksToFilter, {
        currentWsId: wsId,
        flattenSingleChild: false,
        prodMode: PROD_MODE,
        userEmail: user?.email,
        workspaceTier: workspace?.tier ?? null,
      }),
    [user?.email, workspace?.tier, wsId]
  );
  const getVisibleNavigationChildCount = useCallback(
    (link: NavLink | null | undefined) =>
      getFilteredLinks(link?.children).filter(Boolean).length,
    [getFilteredLinks]
  );
  const hasVisibleNavigationChildren = useCallback(
    (link: NavLink | null | undefined) =>
      getVisibleNavigationChildCount(link) > 0,
    [getVisibleNavigationChildCount]
  );
  const hasMultipleVisibleNavigationChildren = useCallback(
    (link: NavLink | null | undefined) =>
      getVisibleNavigationChildCount(link) > 1,
    [getVisibleNavigationChildCount]
  );

  useEffect(() => {
    setInitialized(true);
  }, []);

  // Utility function for path matching that respects segment boundaries
  const matchesPath = useCallback(
    (pathname: string, target?: string, hasChildren?: boolean) => {
      if (!target) return false;

      if (target.endsWith('/*')) {
        const prefix = target.slice(0, -2).replace(/\/+$/u, '') || '/';
        return pathname === prefix || pathname.startsWith(`${prefix}/`);
      }

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
              hasVisibleNavigationChildren(child)
            )) ||
          child?.aliases?.some((alias) =>
            matchesPath(pathname, alias, hasVisibleNavigationChildren(child))
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
    [hasVisibleNavigationChildren, pathname, matchesPath]
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
        if (hasMultipleVisibleNavigationChildren(link)) {
          const children = link.children ?? [];
          const deeper = findActiveNavigation(children, currentPath);
          if (deeper) {
            return {
              currentLinks: deeper.currentLinks,
              history: [navLinks, ...deeper.history],
              titleHistory: [link.title, ...deeper.titleHistory],
              direction: 'forward' as const,
            };
          }

          // If any descendant leaf matches, open this submenu level
          if (hasActiveChild(children)) {
            return {
              currentLinks: children,
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
              hasVisibleNavigationChildren(link)
            )) ||
          link.aliases?.some((alias) =>
            matchesPath(currentPath, alias, hasVisibleNavigationChildren(link))
          );

        if (linkMatches && hasMultipleVisibleNavigationChildren(link)) {
          // Prefer showing submenu when current link matches and has children
          return {
            currentLinks: link.children ?? [],
            history: [navLinks],
            titleHistory: [link.title],
            direction: 'forward' as const,
          };
        }
      }
      return null;
    },
    [
      hasActiveChild,
      hasMultipleVisibleNavigationChildren,
      hasVisibleNavigationChildren,
      matchesPath,
    ]
  );

  const [navState, setNavState] = useState<NavigationState>(() => {
    // Universal logic for active navigation - detects submenu structures consistently
    const activeNavigation = findActiveNavigation(preferredLinks, pathname);

    if (activeNavigation) {
      return activeNavigation;
    }

    return {
      currentLinks: preferredLinks,
      history: [] as (NavLink | null)[][],
      titleHistory: [],
      direction: 'forward' as const,
    };
  });

  useEffect(() => {
    const pathnameChanged = previousPathnameRef.current !== pathname;
    previousPathnameRef.current = pathname;

    setNavState((prevState) => {
      if (!pathnameChanged && prevState.titleHistory.length > 0) {
        const rebasedNavigation = findNavigationByTitleHistory({
          direction: prevState.direction,
          links: preferredLinks,
          titleHistory: prevState.titleHistory,
        });

        if (rebasedNavigation) {
          return getNavigationStateSignature(prevState) ===
            getNavigationStateSignature(rebasedNavigation)
            ? prevState
            : rebasedNavigation;
        }
      }

      // Universal logic for active navigation - detects submenu structures consistently
      const activeNavigation = findActiveNavigation(preferredLinks, pathname);
      if (activeNavigation) {
        return getNavigationStateSignature(prevState) ===
          getNavigationStateSignature(activeNavigation)
          ? prevState
          : activeNavigation;
      }

      const nextState = {
        currentLinks: preferredLinks,
        history: [] as (NavLink | null)[][],
        titleHistory: [],
        direction:
          prevState.history.length > 0 ? 'backward' : prevState.direction,
      };

      return getNavigationStateSignature(prevState) ===
        getNavigationStateSignature(nextState)
        ? prevState
        : nextState;
    });
  }, [pathname, preferredLinks, findActiveNavigation]);

  const handleToggle = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    setCookie(
      SIDEBAR_COLLAPSED_COOKIE_NAME,
      newCollapsed,
      getSidebarCookieOptions()
    );

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
        prevState.history[prevState.history.length - 1] ?? preferredLinks;
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

  const backButton: NavLink = {
    title: t('common.back'),
    icon: <DashboardNavigationIcon className="h-4 w-4" name="ArrowLeft" />,
    onClick: handleNavBack,
    isBack: true,
  };

  const currentTitle = navState.titleHistory[navState.titleHistory.length - 1];
  const showCurrentTitle =
    !isCollapsed &&
    currentTitle &&
    currentTitle !== t('sidebar_tabs.more_tools');
  const filteredCurrentLinks = getFilteredLinks(navState.currentLinks);
  const filteredRootLinks = promoteArchivedWhenMoreToolsOnlyHasArchive(
    getFilteredLinks(preferredLinks)
  );
  const decoratedCurrentLinks = decoratePreferenceActions(filteredCurrentLinks);

  const handleSidebarNavigation = () => {
    if (window.innerWidth < 768) {
      setIsCollapsed(true);
    }
  };

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
            hasVisibleNavigationChildren(link)
          )) ||
        link.aliases?.some((alias) =>
          matchesPath(pathname, alias, hasVisibleNavigationChildren(link))
        )
    )
    .sort((a, b) => (b.href?.length || 0) - (a.href?.length || 0));

  const currentLink = matchedLinks?.[0];

  const sidebarHeader = (
    <>
      {isCollapsed || wsId === ROOT_WORKSPACE_ID || (
        <Link href="/home" className="flex flex-none items-center gap-2">
          <div className="flex-none">
            <TuturuuLogo
              src={TUTURUUU_LOCAL_LOGO_URL}
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
          wsId={wsId}
          hideLeading={isCollapsed}
          disableCreateNewWorkspace={disableCreateNewWorkspace}
        />
      </Suspense>
    </>
  );

  const sidebarContent = (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      {SidebarActiveTimer && (
        <SidebarActiveTimer wsId={wsId} isCollapsed={isCollapsed} />
      )}

      <div className="relative min-h-0 flex-1">
        <div
          key={navState.history.length}
          className={cn(
            'absolute inset-0 flex min-h-0 flex-col transition-transform duration-300 ease-in-out',
            navState.direction === 'forward'
              ? 'slide-in-from-right animate-in'
              : 'slide-in-from-left animate-in'
          )}
        >
          {navState.history.length === 0 ? (
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
              <Nav
                key={`${user?.id}-root`}
                wsId={wsId}
                isCollapsed={isCollapsed}
                links={decoratedCurrentLinks}
                onSubMenuClick={handleNavChange}
                onClick={handleSidebarNavigation}
              />
              {recentNavigationEnabled && RecentSidebarItems && (
                <RecentSidebarItems
                  wsId={wsId}
                  isCollapsed={isCollapsed}
                  links={filteredRootLinks}
                  onNavigate={handleSidebarNavigation}
                />
              )}
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
              {showCurrentTitle && (
                <div className="p-2 pt-0">
                  <h2 className="line-clamp-1 px-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                    {currentTitle}
                  </h2>
                </div>
              )}
              {showCurrentTitle && <div className="mx-4 my-1 border-b" />}
              {filteredCurrentLinks.length > 0 && (
                <div className="scrollbar-none flex-1 overflow-y-auto">
                  <Nav
                    key={`${user?.id}-nav`}
                    wsId={wsId}
                    isCollapsed={isCollapsed}
                    links={decoratedCurrentLinks}
                    onSubMenuClick={handleNavChange}
                    onClick={handleSidebarNavigation}
                  />
                  {recentNavigationEnabled && RecentSidebarItems && (
                    <RecentSidebarItems
                      wsId={wsId}
                      isCollapsed={isCollapsed}
                      links={filteredRootLinks}
                      onNavigate={handleSidebarNavigation}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const header = null;

  const mobileHeader = (
    <>
      <div className="flex flex-none items-center gap-2">
        <Link href="/home" className="flex flex-none items-center gap-2">
          <TuturuuLogo
            src={TUTURUUU_LOCAL_LOGO_URL}
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

  const currentWorkspace: LaunchableWorkspace = {
    id: workspace?.id ?? wsId,
    name: workspace?.name ?? null,
    personal: workspace?.personal ?? false,
  };

  return (
    <>
      <AppsLauncherDialog
        currentWorkspace={currentWorkspace}
        onOpenChange={setAppsLauncherOpen}
        open={appsLauncherOpen}
      />
      <BaseStructure
        isCollapsed={isCollapsed}
        setIsCollapsed={handleToggle}
        header={header}
        mobileHeader={mobileHeader}
        sidebarHeader={sidebarHeader}
        sidebarContent={sidebarContent}
        actions={actions}
        userPopover={userPopover}
        feedbackButton={
          <SidebarFooterActions
            wsId={wsId}
            isCollapsed={isCollapsed}
            showUpgrade={!workspace?.tier || workspace.tier === 'FREE'}
          />
        }
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        hideSizeToggle={behavior === 'hover'}
        overlayOnExpand={behavior === 'hover'}
      >
        {children}
      </BaseStructure>
    </>
  );
}
