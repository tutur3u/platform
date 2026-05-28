'use client';

import { ArrowLeft } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
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
import { useSidebar } from '../context/sidebar-context';
import { SidebarStructureContent } from './sidebar-structure-content';
import {
  SidebarStructureHeader,
  SidebarStructureMobileHeader,
} from './sidebar-structure-header';
import {
  findActiveNavigation,
  getFilteredLinks,
  getNavigationMatches,
  type NavigationState,
  type WorkspaceSelectRenderer,
} from './sidebar-structure-utils';

export interface SidebarStructureProps {
  actions: ReactNode;
  brand?: ReactNode;
  brandHref?: string;
  collapsedBrand?: ReactNode;
  linkBrand?: boolean;
  stackWorkspaceSelect?: boolean;
  childContainerClassName?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  links: (NavLink | null)[];
  mobileBrand?: ReactNode;
  mobileHeaderDivider?: boolean;
  sidebarCollapsedWidth?: string;
  sidebarContentAfter?: ReactNode | WorkspaceSelectRenderer;
  sidebarExpandedWidth?: string;
  sidebarHeaderClassName?: string;
  sidebarHeaderHeight?: string;
  upgradeExternal?: boolean;
  upgradeHref?: string;
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  workspaceSelect: WorkspaceSelectRenderer;
  wsId: string;
  showBrandOnRoot?: boolean;
}

export function SidebarStructure({
  actions,
  brand,
  brandHref = '/',
  collapsedBrand,
  linkBrand = true,
  childContainerClassName,
  children,
  defaultCollapsed = false,
  links,
  mobileBrand,
  mobileHeaderDivider = true,
  sidebarCollapsedWidth,
  sidebarContentAfter,
  sidebarExpandedWidth,
  sidebarHeaderClassName,
  sidebarHeaderHeight,
  showBrandOnRoot = false,
  stackWorkspaceSelect = false,
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
  const [navState, setNavState] = useState<NavigationState>(() => {
    const activeNavigation = findActiveNavigation({
      currentPath: pathname,
      navLinks: links,
    });
    return (
      activeNavigation ?? {
        currentLinks: links,
        direction: 'forward',
        history: [],
        titleHistory: [],
      }
    );
  });

  useEffect(() => {
    setIsCollapsed(behavior === 'collapsed' || behavior === 'hover');
  }, [behavior]);

  useEffect(() => {
    setNavState((prevState) => {
      const activeNavigation = findActiveNavigation({
        currentPath: pathname,
        navLinks: links,
      });
      if (activeNavigation) return activeNavigation;

      if (prevState.history.length > 0) {
        return {
          currentLinks: links,
          direction: 'backward',
          history: [],
          titleHistory: [],
        };
      }

      return { ...prevState, currentLinks: links };
    });
  }, [links, pathname]);

  const backButton: NavLink = useMemo(
    () => ({
      icon: <ArrowLeft className="h-4 w-4" />,
      isBack: true,
      onClick: () => {
        setNavState((prevState) => {
          const newHistory = prevState.history.slice(0, -1);
          return {
            currentLinks: prevState.history.at(-1) ?? links,
            direction: 'backward',
            history: newHistory,
            titleHistory: prevState.titleHistory.slice(0, -1),
          };
        });
      },
      title: t('common.back'),
    }),
    [links, t]
  );

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

  const expandSidebar = useCallback(() => {
    setIsCollapsed(false);
    setCookie(SIDEBAR_COLLAPSED_COOKIE_NAME, false);

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
  const currentLink = getNavigationMatches({
    currentLinks:
      navState.history.length > 0
        ? [backButton, ...filteredCurrentLinks]
        : filteredCurrentLinks,
    pathname,
  })[0];
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

  return (
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
      hideSizeToggle={behavior === 'hover'}
      isCollapsed={isCollapsed}
      mobileHeader={
        <SidebarStructureMobileHeader
          brandHref={brandHref}
          currentIcon={currentLink?.icon}
          currentTitle={currentLink?.title}
          mobileBrand={mobileBrand}
          showDivider={mobileHeaderDivider}
        />
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      overlayOnExpand={behavior === 'hover'}
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
          wsId={wsId}
        />
      }
      sidebarHeader={
        <SidebarStructureHeader
          brand={brand}
          brandHref={brandHref}
          collapsedBrand={collapsedBrand}
          isCollapsed={isCollapsed}
          linkBrand={linkBrand}
          showBrandOnRoot={showBrandOnRoot}
          stackWorkspaceSelect={stackWorkspaceSelect}
          workspaceSelect={workspaceSelect}
          wsId={wsId}
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
  );
}
