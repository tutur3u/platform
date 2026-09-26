'use client';

import type {
  TeachBootstrapResponse,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import { TeachThemeControl } from '@/components/teach-theme-control';
import { TeachWorkspaceSelect } from '@/components/teach-workspace-select';
import { WEB_APP_URL } from '@/constants/common';

interface StructureProps {
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
  return (
    <SidebarStructure
      actions={
        <div className="flex w-full items-center gap-2">
          <TeachThemeControl compact />
          {footerActions}
        </div>
      }
      appId="teach"
      brandHref={WEB_APP_URL}
      defaultCollapsed={defaultCollapsed}
      links={links}
      notificationPopover={notificationPopover}
      showUpgrade={false}
      userPopover={userPopover}
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
  );
}
