'use client';

import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { useSidebar } from '@/context/sidebar-context';

export default function SidebarSettings() {
  return <SharedSidebarSettings useSidebar={useSidebar} />;
}
