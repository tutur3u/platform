'use client';

import {
  type CommandLauncherNavItem,
  GlobalCommandLauncher,
} from '@tuturuuu/satellite/command-launcher';
import type { Workspace } from '@tuturuuu/types';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { PlatformCommandExtraSections } from '@/components/command/platform-extra-sections';
import { flattenNavigation } from '@/components/command/utils/use-navigation-data';
import type { NavLink } from '@/components/navigation';

interface UserNavCommandLauncherProps {
  locale?: string;
  navLinks: (NavLink | null)[];
  workspace?: Workspace | null;
  wsId?: string;
}

export function UserNavCommandLauncher({
  locale,
  navLinks,
  workspace,
  wsId,
}: UserNavCommandLauncherProps) {
  const t = useTranslations('command_palette');
  const launcherT = useTranslations('command_launcher');
  const commandNavItems = useMemo<CommandLauncherNavItem[]>(
    () =>
      flattenNavigation(navLinks).map((item) => ({
        aliases: item.aliases,
        external: item.external,
        group: item.productTitle,
        href: item.href,
        icon: item.icon,
        keywords: item.path,
        subtitle: item.path.join(' / '),
        title: item.title,
      })),
    [navLinks]
  );
  const resolvePlatformWorkspacePath = useCallback(
    (targetWorkspace: { id: string; personal?: boolean | null }) =>
      `/${locale ?? 'en'}/${toWorkspaceSlug(targetWorkspace.id, {
        personal: Boolean(targetWorkspace.personal),
      })}`,
    [locale]
  );

  return (
    <GlobalCommandLauncher
      currentApp="platform"
      currentWorkspaceId={wsId}
      defaultTab={wsId ? 'tasks' : 'all'}
      enableTasks={Boolean(wsId)}
      extraSections={({ activeTab, onClose, query, setQuery }) => (
        <PlatformCommandExtraSections
          activeTab={activeTab}
          navLinks={navLinks}
          onApplySearch={setQuery}
          onClose={onClose}
          query={query}
          workspaceId={wsId}
          workspaceName={workspace?.name}
        />
      )}
      labels={{
        actions: t('tabs.actions'),
        all: t('tabs.all'),
        apps: t('tabs.apps'),
        categories: t('tabs.label'),
        current: launcherT('current'),
        empty: t('no_results'),
        emptyDescription: t('try_searching'),
        errorWorkspaces: launcherT('error_workspaces'),
        guest: launcherT('guest'),
        loadingWorkspaces: t('loading_workspaces'),
        match: launcherT('match'),
        navigate: launcherT('navigate'),
        navigation: t('tabs.navigate'),
        open: launcherT('open'),
        openApp: launcherT('open_app'),
        openWorkspace: launcherT('open_workspace'),
        personal: launcherT('personal'),
        placeholder: t('search_placeholder_power'),
        searchHint: launcherT('search_hint'),
        select: launcherT('select'),
        tasks: t('tabs.tasks'),
        title: t('title'),
        workspaces: launcherT('workspaces'),
      }}
      navItems={commandNavItems}
      workspacePathResolver={resolvePlatformWorkspacePath}
    />
  );
}
