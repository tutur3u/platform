'use client';
import { TTR_URL } from '@tuturuuu/meet-core/constants/common';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';

export function Structure({
  children,
  links,
  userPopover,
  actions,
  notificationPopover,
  defaultCollapsed,
  wsId,
  workspace,
}: {
  children: ReactNode;
  links: NavLink[];
  userPopover: ReactNode;
  actions: ReactNode;
  notificationPopover: ReactNode;
  defaultCollapsed: boolean;
  wsId: string;
  workspace: {
    id: string;
    name?: string | null;
    personal?: boolean | null;
    tier?: string | null;
  };
}) {
  return (
    <SidebarStructure
      appId="parley"
      appHref="/"
      brandHref={TTR_URL}
      wsId={wsId}
      workspace={workspace}
      links={links}
      actions={actions}
      userPopover={userPopover}
      notificationPopover={notificationPopover}
      defaultCollapsed={defaultCollapsed}
      upgradeExternal
      upgradeHref={`${TTR_URL}/personal/billing`}
    >
      {children}
    </SidebarStructure>
  );
}
