'use client';

import {
  buildCommandLauncherLabels,
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
  const labels = useMemo(
    () => ({
      ...buildCommandLauncherLabels({ launcher: launcherT, palette: t }),
      searchHint: t('task_command.syntax_hint'),
    }),
    [launcherT, t]
  );

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
      // Task sections already create a task from the typed name.
      fallbackActions={{ createTask: false }}
      // Mounted inside the Tasks provider tree (task dialog, route prefix), so
      // it outranks the shell launcher and becomes the document's center.
      instancePriority={10}
      labels={labels}
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
