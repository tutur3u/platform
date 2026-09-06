'use client';

import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SatelliteShell } from '@tuturuuu/ui/custom/satellite-shell';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { useSatelliteShell } from '@tuturuuu/ui/custom/use-satellite-shell';
import type { LaunchableWorkspace } from '@tuturuuu/utils/launchable-apps';
import { setCookie } from 'cookies-next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '../constants/common';
import {
  getSidebarCookieOptions,
  useSidebar,
} from '../context/sidebar-context';
import { AppsLauncherDialog } from './apps-launcher';
import {
  type AppBrandId,
  WorkspaceSelectVisibilityToggle,
} from './fixed-app-brand';
import { SidebarSettingsButton } from './sidebar-settings-button';
import { SidebarStructureContent } from './sidebar-structure-content';

import {
  getFilteredLinks,
  type WorkspaceSelectRenderer,
} from './sidebar-structure-utils';
import { WorkspaceSelectorProvider } from './workspace-selector-context';

const persistCollapsed = (collapsed: boolean) =>
  setCookie(
    SIDEBAR_COLLAPSED_COOKIE_NAME,
    collapsed,
    getSidebarCookieOptions()
  );

export interface SidebarStructureProps {
  actions: ReactNode;
  appHref?: string;
  appId: AppBrandId;
  brandActions?: ReactNode;
  brandHref?: string;
  childContainerClassName?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  links: (NavLink | null)[];
  notificationPopover?: ReactNode;
  sidebarCollapsedWidth?: string;
  sidebarContentAfter?: ReactNode | WorkspaceSelectRenderer;
  sidebarExpandedWidth?: string;
  sidebarHeaderClassName?: string;
  sidebarHeaderHeight?: string;
  showSettingsButton?: boolean;
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
  appId,
  brandActions,
  brandHref = '/',
  childContainerClassName,
  children,
  defaultCollapsed = false,
  links,
  notificationPopover,
  sidebarCollapsedWidth,
  sidebarContentAfter,
  sidebarExpandedWidth,
  sidebarHeaderClassName,
  sidebarHeaderHeight,
  showSettingsButton = true,
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
  const {
    isCollapsed,
    setIsCollapsed,
    appsLauncherOpen,
    setAppsLauncherOpen,
    workspaceSelectVisible,
    setWorkspaceSelectVisible,
    navState,
    setNavState,
    backButton,
    handleToggle,
    expandSidebar,
    closeOnMobile,
    onMouseEnter,
    onMouseLeave,
  } = useSatelliteShell({
    pathname,
    links,
    defaultCollapsed,
    behavior,
    handleBehaviorChange,
    backLabel: t('common.back'),
    persistCollapsed,
  });
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
  const showWorkspaceSelect = workspaceSelectVisible && !isCollapsed;
  const handleToggleWorkspaceSelect = workspaceSelect
    ? () => {
        const nextVisible = !showWorkspaceSelect;
        setWorkspaceSelectVisible(nextVisible);
        if (nextVisible && isCollapsed) expandSidebar();
      }
    : undefined;

  const workspaceToggle = handleToggleWorkspaceSelect ? (
    <WorkspaceSelectVisibilityToggle
      hideLabel={t('command_launcher.hide_workspace_selector')}
      showLabel={t('command_launcher.show_workspace_selector')}
      onToggle={handleToggleWorkspaceSelect}
      visible={showWorkspaceSelect}
    />
  ) : null;

  return (
    <>
      <AppsLauncherDialog
        currentWorkspace={currentWorkspace}
        onOpenChange={setAppsLauncherOpen}
        open={appsLauncherOpen}
      />
      <WorkspaceSelectorProvider
        renderWorkspaceSelect={workspaceSelect}
        visible={showWorkspaceSelect}
        workspace={currentWorkspace}
      >
        <SatelliteShell
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
          notificationPopover={notificationPopover}
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
              workspaceSelectVisible={showWorkspaceSelect}
              wsId={wsId}
            />
          }
          homeLabel={t('common.home')}
          collapsedLogo={
            <TuturuuLogo alt="" className="h-7 w-7" height={32} width={32} />
          }
          brand={{
            appName: t(`command_launcher.app_names.${appId}`),
            appHref: appHref ?? `/${wsId}`,
            centralHref: brandHref,
            launcherLabel: t('command_launcher.apps'),
            onAppClick: () => setAppsLauncherOpen(true),
            LinkComponent: Link,
            logo: (
              <TuturuuLogo alt="" className="size-8" height={32} width={32} />
            ),
            actions: (
              <div className="flex items-center gap-1">
                {brandActions}
                {workspaceToggle}
              </div>
            ),
          }}
          mobileBrandActions={workspaceToggle}
          userPopover={userPopover}
          sidebarUtility={
            showSettingsButton ? (
              <SidebarSettingsButton
                isCollapsed={isCollapsed}
                label={t('common.settings')}
              />
            ) : null
          }
        >
          {childContainerClassName ? (
            <div className={childContainerClassName}>{children}</div>
          ) : (
            children
          )}
        </SatelliteShell>
      </WorkspaceSelectorProvider>
    </>
  );
}
