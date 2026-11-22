'use client';

import { useSidebar } from '@tuturuuu/satellite/sidebar-context';
import SidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';

export function MeetSidebarSettings() {
  return <SidebarSettings useSidebar={useSidebar} />;
}
