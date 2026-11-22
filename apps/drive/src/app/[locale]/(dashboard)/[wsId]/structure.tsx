'use client';

import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import { TTR_URL } from '@/constants/common';
import { DriveStorageCard } from './drive/drive-storage-card';
import { WorkspaceSelect } from './workspace-select';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  disableCreateNewWorkspace?: boolean;
  links: (NavLink | null)[];
  notificationPopover: ReactNode;
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

export function Structure({
  actions,
  children,
  defaultCollapsed = false,
  disableCreateNewWorkspace,
  links,
  notificationPopover,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  return (
    <SidebarStructure
      actions={actions}
      appId="drive"
      brandHref={TTR_URL}
      defaultCollapsed={defaultCollapsed}
      links={links}
      notificationPopover={notificationPopover}
      sidebarContentAfter={({ isCollapsed }) =>
        isCollapsed ? null : <DriveStorageCard wsId={wsId} />
      }
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      workspaceSelect={({ isCollapsed, standalone }) => (
        <WorkspaceSelect
          disableCreateNewWorkspace={disableCreateNewWorkspace}
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
