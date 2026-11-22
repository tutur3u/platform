'use client';

import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SatelliteShell } from '@tuturuuu/ui/custom/satellite-shell';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { useSatelliteShell } from '@tuturuuu/ui/custom/use-satellite-shell';
import { useWorkspaceSelectSection } from '@tuturuuu/ui/custom/workspace-select-reveal';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
import type { LaunchableWorkspace } from '@tuturuuu/utils/launchable-apps';
import { setCookie } from 'cookies-next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, Suspense } from 'react';
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

export { SidebarOverlayLayout } from './sidebar-overlay-layout';

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
  contentFullBleed?: boolean;
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
  showUpgrade?: boolean;
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
  contentFullBleed,
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
  showUpgrade,
  upgradeExternal = false,
  upgradeHref,
  userPopover,
  workspace,
  workspaceSelect,
  wsId,
}: SidebarStructureProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { open: settingsDialogOpen } = useSettingsDialogUrlState();
  const { behavior: configuredBehavior, handleBehaviorChange } = useSidebar();
  const {
    behavior,
    isCollapsed,
    mobileSidebarOpen,
    setIsCollapsed,
    appsLauncherOpen,
    setAppsLauncherOpen,
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
    behavior: configuredBehavior,
    // The account footer can own Settings, so keep it mounted while open.
    holdBehavior: settingsDialogOpen,
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
  const workspaceSection = useWorkspaceSelectSection(isCollapsed);
  const showWorkspaceSelect =
    workspaceSection.visible && !(behavior === 'minimal' && isCollapsed);

  const workspaceToggle = workspaceSelect ? (
    <WorkspaceSelectVisibilityToggle
      controls={workspaceSection.id}
      hideLabel={t('command_launcher.hide_workspace_selector')}
      showLabel={t('command_launcher.show_workspace_selector')}
      onToggle={() => workspaceSection.toggle(expandSidebar)}
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
          contentFullBleed={contentFullBleed}
          feedbackButton={
            <SidebarFooterActions
              isCollapsed={isCollapsed}
              showUpgrade={
                showUpgrade ?? (!workspace?.tier || workspace.tier === 'FREE')
              }
              upgradeExternal={upgradeExternal}
              upgradeHref={upgradeHref}
              wsId={wsId}
            />
          }
          header={null}
          hideSizeToggle={behavior === 'hover' || behavior === 'minimal'}
          isCollapsed={isCollapsed}
          mobileSidebarOpen={mobileSidebarOpen}
          notificationPopover={notificationPopover}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          sidebarOverlayOpen={appsLauncherOpen || settingsDialogOpen}
          overlayOnExpand={behavior === 'hover' || behavior === 'minimal'}
          sidebarMinimal={behavior === 'minimal'}
          sidebarLabels={{
            open: t('common.open_sidebar'),
            close: t('common.close_sidebar'),
          }}
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
              workspaceSelectId={workspaceSection.id}
              workspaceSelectOpenRequest={workspaceSection.openRequest}
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
          userPopover={isCollapsed ? userPopover : null}
          sidebarUtility={
            showSettingsButton ? (
              <SidebarSettingsButton
                isCollapsed={isCollapsed}
                label={t('common.settings')}
              />
            ) : null
          }
        >
          <Suspense
            fallback={<div aria-busy="true" className="min-h-40 flex-1" />}
          >
            {childContainerClassName ? (
              <div className={childContainerClassName}>{children}</div>
            ) : (
              children
            )}
          </Suspense>
        </SatelliteShell>
      </WorkspaceSelectorProvider>
    </>
  );
}
