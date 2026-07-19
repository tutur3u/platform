'use client';

import { listCurrentUserAiChats } from '@tuturuuu/internal-api';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import { TTR_URL } from '@/constants/common';
import { RewiseSidebarChats } from './rewise-sidebar-chats';
import { WorkspaceSelect } from './workspace-select';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  personalOrWsId: string;
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

export function Structure({
  actions,
  children,
  defaultCollapsed = false,
  links,
  personalOrWsId,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  const brandHref = `/${personalOrWsId}/new`;

  return (
    <SidebarStructure
      actions={actions}
      appHref={brandHref}
      appName="Rewise"
      brandHref={TTR_URL}
      defaultCollapsed={defaultCollapsed}
      links={links}
      sidebarContentAfter={({ closeOnMobile, isCollapsed }) => (
        <RewiseSidebarChats
          closeOnMobile={closeOnMobile}
          isCollapsed={isCollapsed}
          listChats={listCurrentUserAiChats}
          personalOrWsId={personalOrWsId}
        />
      )}
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
