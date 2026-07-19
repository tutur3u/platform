'use client';

import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import { TTR_URL } from '@/constants/common';

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
      appName="Infrastructure"
      brandHref={TTR_URL}
      childContainerClassName="mx-auto flex w-full max-w-7xl flex-col gap-8 md:px-2"
      defaultCollapsed={defaultCollapsed}
      links={links}
      sidebarExpandedWidth="18.5rem"
      sidebarHeaderClassName="border-foreground/10 border-b"
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}
