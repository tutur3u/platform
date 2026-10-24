'use client';

import { Paintbrush, PanelLeft } from '@tuturuuu/icons';
import {
  createAccountSettingsNavGroup,
  SatelliteAccountSettingsPanel,
} from '@tuturuuu/satellite/account-settings';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';

export function SettingsDialog({
  centralUrl,
  defaultTab = 'profile',
  user,
}: {
  centralUrl: string;
  defaultTab?: string;
  user: WorkspaceUser | null;
  wsId?: string;
}) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const navItems = [
    createAccountSettingsNavGroup(t),
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
      <SatelliteAccountSettingsPanel
        activeTab={activeTab}
        centralUrl={centralUrl}
        user={user}
      />
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
