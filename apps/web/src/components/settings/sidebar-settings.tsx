'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { Separator } from '@tuturuuu/ui/separator';
import { useSidebar } from '@/context/sidebar-context';
import NavigationSettings from './navigation-settings';
import { SidebarNavigationLayoutSettings } from './sidebar-navigation-layout-settings';

interface NavigationSidebarSettingsProps {
  wsId?: string;
  user: WorkspaceUser | null;
}

export default function NavigationSidebarSettings({
  wsId,
  user,
}: NavigationSidebarSettingsProps) {
  return (
    <div className="space-y-8">
      {user && (
        <>
          <NavigationSettings wsId={wsId} user={user} />
          <Separator />
        </>
      )}
      <SharedSidebarSettings useSidebar={useSidebar} />
      <Separator />
      <SidebarNavigationLayoutSettings wsId={wsId} />
    </div>
  );
}
