'use client';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types/db';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import type { ReactNode } from 'react';
import { WEB_APP_URL } from '@/constants/common';
export function Structure({
  children,
  wsId,
  actorId,
  workspace,
  workspaces,
  links,
  defaultCollapsed,
  actions,
  userPopover,
  notificationPopover,
}: {
  children: ReactNode;
  wsId: string;
  actorId: string;
  workspace: {
    id: string;
    name?: string | null;
    personal?: boolean | null;
    tier?: string | null;
  };
  workspaces: InternalApiWorkspaceSummary[];
  links: NavLink[];
  defaultCollapsed: boolean;
  actions: ReactNode;
  userPopover: ReactNode;
  notificationPopover: ReactNode;
}) {
  return (
    <SidebarStructure
      appId="lettin"
      appHref={`/${wsId}`}
      brandHref={WEB_APP_URL}
      wsId={wsId}
      workspace={workspace}
      links={links}
      defaultCollapsed={defaultCollapsed}
      actions={actions}
      userPopover={userPopover}
      notificationPopover={notificationPopover}
      showUpgrade={false}
      childContainerClassName="min-w-0 w-full"
      workspaceSelect={() => (
        <WorkspaceSelect
          standalone
          wsId={wsId}
          cacheScope={actorId}
          disableCreateNewWorkspace
          fetchWorkspaces={async () => workspaces}
          resolveNextPathname={({ nextSlug }) => `/${nextSlug}`}
          showTierBadges={false}
        />
      )}
    >
      {children}
    </SidebarStructure>
  );
}
