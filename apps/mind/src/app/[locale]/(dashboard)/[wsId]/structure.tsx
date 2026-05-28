'use client';

import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import { TTR_URL } from '@/constants/common';
import { MindSidebarBoards } from './mind-sidebar-boards';
import { WorkspaceSelect } from './workspace-select';

type StructureProps = {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  workspaceSlug: string;
  wsId: string;
};

export function Structure({
  actions,
  children,
  defaultCollapsed,
  links,
  userPopover,
  workspace,
  workspaceSlug,
  wsId,
}: StructureProps) {
  return (
    <SidebarStructure
      actions={actions}
      defaultCollapsed={defaultCollapsed}
      links={links}
      sidebarContentAfter={({ isCollapsed }) =>
        isCollapsed ? null : (
          <MindSidebarBoards workspaceSlug={workspaceSlug} wsId={wsId} />
        )
      }
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      workspaceSelect={({ isCollapsed }) => (
        <WorkspaceSelect hideLeading={isCollapsed} wsId={wsId} />
      )}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}
