'use client';

import { Paintbrush, PanelLeft } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import {
  SettingsDialogShell,
  type SettingsNavGroup,
  type SettingsNavItem,
} from '@tuturuuu/ui/custom/settings-dialog-shell';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { createAccountSettingsNavGroup } from './account-settings-navigation';
import { SatelliteAccountSettingsPanel } from './account-settings-panel';

export interface SatelliteSidebarSettingsTab {
  content: ReactNode;
  description: string;
  label: string;
}

export type SatelliteAccountSettingsTab = SettingsNavItem & {
  content: ReactNode;
};

/**
 * Baseline settings dialog for satellites without an app-specific dialog:
 * the shared account tabs, appearance, and an optional sidebar tab.
 */
export function SatelliteDefaultSettingsDialog({
  accountTab,
  centralUrl,
  canManageVersionBadge,
  defaultTab = 'profile',
  sidebarTab,
  user,
}: {
  accountTab?: SatelliteAccountSettingsTab;
  centralUrl: string;
  canManageVersionBadge?: boolean;
  defaultTab?: string;
  sidebarTab?: SatelliteSidebarSettingsTab;
  user: WorkspaceUser | null;
}) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const account = createAccountSettingsNavGroup(t);
  const navItems: SettingsNavGroup[] = [
    accountTab ? { ...account, items: [...account.items, accountTab] } : account,
    {
      label: t('satellite-account-settings.preferences'),
      items: [
        {
          description: t('satellite-account-settings.appearance_description'),
          icon: Paintbrush,
          keywords: ['Appearance', 'Theme', 'Language'],
          label: t('satellite-account-settings.appearance'),
          name: 'appearance',
        },
        ...(sidebarTab
          ? [
              {
                description: sidebarTab.description,
                icon: PanelLeft,
                keywords: ['Sidebar', 'Navigation', 'Menu'],
                label: sidebarTab.label,
                name: 'sidebar',
              },
            ]
          : []),
      ],
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
          canManageVersionBadge={
            canManageVersionBadge ?? isExactTuturuuuDotComEmail(user?.email)
          }
        />
      )}
      {activeTab === 'sidebar' && sidebarTab?.content}
      {accountTab && activeTab === accountTab.name && accountTab.content}
    </SettingsDialogShell>
  );
}
