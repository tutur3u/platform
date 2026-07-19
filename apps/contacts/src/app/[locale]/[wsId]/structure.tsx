'use client';

import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import { TTR_URL } from '@/constants/common';
import { WorkspaceSelect } from './workspace-select';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

export function Structure({
  actions,
  children,
  defaultCollapsed = false,
  links,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  return (
    <SidebarStructure
      actions={actions}
      appName="Contacts"
      brandHref={TTR_URL}
      childContainerClassName="mx-auto w-full max-w-[1500px] md:px-4 md:py-3"
      defaultCollapsed={defaultCollapsed}
      links={links}
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
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
