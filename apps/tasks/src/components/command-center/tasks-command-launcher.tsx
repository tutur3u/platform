'use client';

import {
  type CommandLauncherNavItem,
  GlobalCommandLauncher,
} from '@tuturuuu/satellite/command-launcher';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { TaskCommandSections } from './task-command-sections';

export function TasksCommandLauncher({
  isPersonalWorkspace,
  navLinks,
  workspaceSlug,
  wsId,
}: {
  isPersonalWorkspace: boolean;
  navLinks: (NavLink | null)[];
  workspaceSlug: string;
  wsId: string;
}) {
  const t = useTranslations('command_palette');
  const launcherT = useTranslations('command_launcher');
  const commandNavItems = useMemo(() => flattenNavLinks(navLinks), [navLinks]);

  return (
    <GlobalCommandLauncher
      currentApp="tasks"
      currentWorkspaceId={wsId}
      defaultTab="tasks"
      enableTasks
      extraSections={(context) => (
        <TaskCommandSections
          context={context}
          isPersonalWorkspace={isPersonalWorkspace}
          workspaceSlug={workspaceSlug}
          wsId={wsId}
        />
      )}
      instancePriority={10}
      labels={{
        actions: t('tabs.actions'),
        all: t('tabs.all'),
        apps: t('tabs.apps'),
        categories: t('tabs.label'),
        close: launcherT('close'),
        current: launcherT('current'),
        currentApp: launcherT('current_app'),
        currentWorkspace: launcherT('current_workspace'),
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
        searchHint: t('task_command.syntax_hint'),
        select: launcherT('select'),
        tasks: t('tabs.tasks'),
        title: t('title'),
        workspaces: launcherT('workspaces'),
      }}
      navItems={commandNavItems}
    />
  );
}

function flattenNavLinks(
  links: (NavLink | null)[],
  parents: string[] = []
): CommandLauncherNavItem[] {
  return links.flatMap((link) => {
    if (!link) return [];
    const path = [...parents, link.title];
    const children = flattenNavLinks(link.children ?? [], path);
    if (!link.href) return children;
    const current: CommandLauncherNavItem = {
      aliases: link.aliases,
      href: link.href,
      icon: link.icon,
      keywords: path,
      subtitle: path.join(' / '),
      title: link.title,
    };
    return [current, ...children];
  });
}
