'use client';

import { ArrowLeft } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import type { LaunchableWorkspace } from '@tuturuuu/utils/launchable-apps';
import { setCookie } from 'cookies-next';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '../constants/common';
import {
  getSidebarCookieOptions,
  useSidebar,
} from '../context/sidebar-context';
import { AppsLauncherDialog } from './apps-launcher';
import { SidebarStructureContent } from './sidebar-structure-content';
import {
  SidebarStructureHeader,
  SidebarStructureMobileHeader,
} from './sidebar-structure-header';
import {
  findActiveNavigation,
  getFilteredLinks,
  type NavigationState,
  type WorkspaceSelectRenderer,
} from './sidebar-structure-utils';

export interface SidebarStructureProps {
  actions: ReactNode;
  appHref?: string;
  appName: ReactNode;
  brandActions?: ReactNode;
  brandHref?: string;
  childContainerClassName?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  links: (NavLink | null)[];
  sidebarCollapsedWidth?: string;
  sidebarContentAfter?: ReactNode | WorkspaceSelectRenderer;
  sidebarExpandedWidth?: string;
  sidebarHeaderClassName?: string;
  sidebarHeaderHeight?: string;
  upgradeExternal?: boolean;
  upgradeHref?: string;
  userPopover: ReactNode;
  workspace: {
    id?: string | null;
    name?: string | null;
    personal?: boolean | null;
    tier?: string | null;
  } | null;
  workspaceSelect?: WorkspaceSelectRenderer;
  wsId: string;
}

export function SidebarStructure({
  actions,
  appHref,
  appName,
  brandActions,
  brandHref = '/',
  childContainerClassName,
  children,
  defaultCollapsed = false,
  links,
  sidebarCollapsedWidth,
  sidebarContentAfter,
  sidebarExpandedWidth,
  sidebarHeaderClassName,
  sidebarHeaderHeight,
  upgradeExternal = false,
  upgradeHref,
  userPopover,
  workspace,
  workspaceSelect,
  wsId,
}: SidebarStructureProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { behavior, handleBehaviorChange } = useSidebar();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
  const navigationLinks = useMemo<(NavLink | null)[]>(() => links, [links]);
  const [navState, setNavState] = useState<NavigationState>(() => {
    const activeNavigation = findActiveNavigation({
      currentPath: pathname,
      navLinks: navigationLinks,
    });
    return (
      activeNavigation ?? {
        currentLinks: navigationLinks,
        direction: 'forward',
        history: [],
        titleHistory: [],
      }
    );
  });

  useEffect(() => {
    setIsCollapsed(
      behavior === 'collapsed' || behavior === 'hover' || behavior === 'hidden'
    );
  }, [behavior]);

  useEffect(() => {
    setNavState((prevState) => {
      const activeNavigation = findActiveNavigation({
        currentPath: pathname,
        navLinks: navigationLinks,
      });
      if (activeNavigation) return activeNavigation;

      if (prevState.history.length > 0) {
        return {
          currentLinks: navigationLinks,
          direction: 'backward',
          history: [],
          titleHistory: [],
        };
      }

      return { ...prevState, currentLinks: navigationLinks };
    });
  }, [navigationLinks, pathname]);

  const backButton: NavLink = useMemo(
    () => ({
      icon: <ArrowLeft className="h-4 w-4" />,
      isBack: true,
      onClick: () => {
        setNavState((prevState) => {
          const newHistory = prevState.history.slice(0, -1);
          return {
            currentLinks: prevState.history.at(-1) ?? navigationLinks,
            direction: 'backward',
            history: newHistory,
            titleHistory: prevState.titleHistory.slice(0, -1),
          };
        });
      },
      title: t('common.back'),
    }),
    [navigationLinks, t]
  );

  const handleToggle = () => {
    if (behavior === 'hidden') {
      setIsCollapsed(true);
      handleBehaviorChange('collapsed');
      return;
    }

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

  const expandSidebar = useCallback(() => {
    setIsCollapsed(false);
    setCookie(SIDEBAR_COLLAPSED_COOKIE_NAME, false, getSidebarCookieOptions());

    if (behavior !== 'expanded') {
      handleBehaviorChange('expanded');
    }
  }, [behavior, handleBehaviorChange]);

  const hasOpenDialogs = useCallback(
    () =>
      document.querySelector('[data-state="open"][role="dialog"]') !== null ||
      document.querySelector('[data-state="open"][role="alertdialog"]') !==
        null,
    []
  );
  const isHoverMode = behavior === 'hover';
  const onMouseEnter = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) setIsCollapsed(false);
      }
    : undefined;
  const onMouseLeave = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) setIsCollapsed(true);
      }
    : undefined;
  const closeOnMobile = useCallback(() => {
    if (window.innerWidth < 768) setIsCollapsed(true);
  }, []);

  const filteredCurrentLinks = getFilteredLinks(navState.currentLinks);
  const currentTitle = navState.titleHistory.at(-1);
  const extraContent =
    typeof sidebarContentAfter === 'function'
      ? sidebarContentAfter({
          closeOnMobile,
          expandSidebar,
          isCollapsed,
          setIsCollapsed,
        })
      : sidebarContentAfter;
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
        actions={actions}
        feedbackButton={
          <SidebarFooterActions
            isCollapsed={isCollapsed}
            showUpgrade={!workspace?.tier || workspace.tier === 'FREE'}
            upgradeExternal={upgradeExternal}
            upgradeHref={upgradeHref}
            wsId={wsId}
          />
        }
        header={null}
        hideSizeToggle={behavior === 'hover' || behavior === 'hidden'}
        isCollapsed={isCollapsed}
        mobileHeader={
          <SidebarStructureMobileHeader
            appHref={appHref ?? `/${wsId}`}
            appName={appName}
            brandHref={brandHref}
            launcherLabel={t('command_launcher.apps')}
            onOpenApps={() => setAppsLauncherOpen(true)}
          />
        }
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        overlayOnExpand={behavior === 'hover'}
        sidebarHidden={behavior === 'hidden'}
        sidebarCollapsedWidth={sidebarCollapsedWidth}
        sidebarExpandedWidth={sidebarExpandedWidth}
        sidebarHeaderClassName={sidebarHeaderClassName}
        sidebarHeaderHeight={sidebarHeaderHeight}
        setIsCollapsed={handleToggle}
        sidebarContent={
          <SidebarStructureContent
            backButton={backButton}
            currentTitle={currentTitle}
            extraContent={extraContent}
            filteredCurrentLinks={filteredCurrentLinks}
            isCollapsed={isCollapsed}
            navState={navState}
            setIsCollapsed={setIsCollapsed}
            setNavState={setNavState}
            workspaceSelect={workspaceSelect}
            wsId={wsId}
          />
        }
        sidebarHeader={
          <SidebarStructureHeader
            actions={brandActions}
            appHref={appHref ?? `/${wsId}`}
            appName={appName}
            brandHref={brandHref}
            isCollapsed={isCollapsed}
            launcherLabel={t('command_launcher.apps')}
            onOpenApps={() => setAppsLauncherOpen(true)}
          />
        }
        userPopover={userPopover}
      >
        {childContainerClassName ? (
          <div className={childContainerClassName}>{children}</div>
        ) : (
          children
        )}
      </BaseStructure>
    </>
  );
}
