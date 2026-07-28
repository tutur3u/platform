'use client';

import { Paintbrush, PanelLeft, User } from '@tuturuuu/icons';
import { SatelliteProfileSettingsPanel } from '@tuturuuu/satellite/workspace-settings';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';

export function SettingsDialog({
  defaultTab = 'profile',
  user,
}: {
  defaultTab?: string;
  user: WorkspaceUser | null;
  wsId?: string;
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const navItems = [
    {
      items: [
        {
          description: 'Manage your account profile',
          icon: User,
          keywords: ['Profile'],
          label: 'Profile',
          name: 'profile',
        },
      ],
      label: 'Account',
    },
    {
      items: [
        {
          description: 'Theme and visual preferences',
          icon: Paintbrush,
          keywords: ['Appearance', 'Theme'],
          label: 'Appearance',
          name: 'appearance',
        },
        {
          description: 'Sidebar behavior',
          icon: PanelLeft,
          keywords: ['Sidebar', 'Navigation'],
          label: 'Sidebar',
          name: 'sidebar',
        },
      ],
      label: 'Preferences',
    },
  ];

  return (
    <SettingsDialogShell
      activeTab={activeTab}
      keyboardNavigation
      navItems={navItems}
      onActiveTabChange={setActiveTab}
    >
      {activeTab === 'profile' && user && (
        <SatelliteProfileSettingsPanel user={user} />
      )}
      {activeTab === 'appearance' && (
        <AppearanceSettings
          canManageVersionBadge={isExactTuturuuuDotComEmail(user?.email)}
        />
      )}
      {activeTab === 'sidebar' && (
        <SharedSidebarSettings useSidebar={useSidebar} />
      )}
    </SettingsDialogShell>
  );
}
