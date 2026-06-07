'use client';

import {
  type CommandLauncherNavItem,
  GlobalCommandLauncher,
} from '@tuturuuu/satellite/command-launcher';
import type { Workspace } from '@tuturuuu/types';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
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
      extraSections={({ onClose, query, setQuery }) => (
        <PlatformCommandExtraSections
          navLinks={navLinks}
          onApplySearch={setQuery}
          onClose={onClose}
          query={query}
          workspaceId={wsId}
          workspaceName={workspace?.name}
        />
      )}
      navItems={commandNavItems}
      workspacePathResolver={resolvePlatformWorkspacePath}
    />
  );
}
