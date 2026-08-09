'use client';

import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import { WorkspaceSelect } from './workspace-select';

export function Structure({
  actions,
  children,
  defaultCollapsed,
  links,
  notificationPopover,
  userPopover,
  workspace,
  wsId,
}: {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  notificationPopover: ReactNode;
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}) {
  return (
    <SidebarStructure
      actions={actions}
      appId="git"
      childContainerClassName="mx-auto w-full max-w-[1500px] md:px-4 md:py-3"
      defaultCollapsed={defaultCollapsed}
      links={links}
      notificationPopover={notificationPopover}
      userPopover={userPopover}
      workspace={workspace}
      workspaceSelect={({ isCollapsed, standalone }) => (
        <WorkspaceSelect
          hideLeading={isCollapsed}
          standalone={standalone}
          wsId={wsId}
        />
      )}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}
