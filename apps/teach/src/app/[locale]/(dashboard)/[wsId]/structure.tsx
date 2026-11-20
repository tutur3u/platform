'use client';

import { Search } from '@tuturuuu/icons';
import {
  GlobalCommandLauncher,
  openGlobalCommandLauncher,
} from '@tuturuuu/satellite/command-launcher';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { teachNavigationItems } from '@/components/teach-navigation-items';
import type {
  TeachBootstrapResponse,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import { appPath, runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import { LmsAreaSwitchLink } from '@/components/lms-area-switch';
import { TeachThemeControl } from '@/components/teach-theme-control';
import { TeachWorkspaceSelect } from '@/components/teach-workspace-select';
import { WEB_APP_URL } from '@/constants/common';

interface StructureProps {
  areaSwitchHref?: string | null;
  bootstrap: TeachBootstrapResponse;
  children: ReactNode;
  defaultCollapsed: boolean;
  footerActions: ReactNode;
  links: NavLink[];
  notificationPopover: ReactNode;
  userPopover: ReactNode;
  workspace: TulearnWorkspaceSummary;
  wsId: string;
}

export function Structure({
  areaSwitchHref = null,
  bootstrap,
  children,
  defaultCollapsed,
  footerActions,
  links,
  notificationPopover,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  const t = useTranslations('teacherWorkspace');
  return (
    <>
      <GlobalCommandLauncher
        currentApp="teach"
        currentWorkspaceId={wsId}
        defaultTab="navigation"
        instancePriority={1}
        navItems={teachNavigationItems(links).map((item) => ({
          ...item,
          href: appPath(item.href),
        }))}
        labels={{ title: t('quickLinks'), placeholder: t('searchNavigation') }}
      />
      <SidebarStructure
        actions={
          <div className="flex w-full min-w-0 flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openGlobalCommandLauncher}
              title="Ctrl+K / ⌘K"
              aria-keyshortcuts="Control+k Meta+k"
            >
              <Search aria-hidden />
              {t('searchNavigation')}
            </Button>
            <TeachThemeControl compact />
            <div className="flex w-full min-w-0 items-center gap-1">
              {footerActions}
            </div>
          </div>
        }
        appId="teach"
        brandActions={
          areaSwitchHref ? <LmsAreaSwitchLink href={areaSwitchHref} /> : null
        }
        brandHref={
          runtimeAppBase() === '/lms/teach'
            ? 'https://tuturuuu.com/lms'
            : WEB_APP_URL
        }
        childContainerClassName="mx-auto w-full max-w-[1500px]"
        defaultCollapsed={defaultCollapsed}
        links={links}
        notificationPopover={notificationPopover}
        showUpgrade={false}
        userPopover={
          <>
            {areaSwitchHref ? (
              <LmsAreaSwitchLink href={areaSwitchHref} />
            ) : null}
            {userPopover}
          </>
        }
        workspace={workspace}
        workspaceSelect={() => (
          <TeachWorkspaceSelect
            cacheScope={bootstrap.profile.id}
            workspaces={bootstrap.workspaces}
            wsId={wsId}
          />
        )}
        wsId={wsId}
      >
        {children}
      </SidebarStructure>
    </>
  );
}
