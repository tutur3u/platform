'use client';

import { Paintbrush, PanelLeft } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import {
  SettingsDialogShell,
  type SettingsNavGroup,
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

/**
 * Baseline settings dialog for satellites without an app-specific dialog:
 * the shared account tabs, appearance, and an optional sidebar tab.
 */
export function SatelliteDefaultSettingsDialog({
  centralUrl,
  canManageVersionBadge,
  defaultTab = 'profile',
  onCloseAutoFocus,
  sidebarTab,
  user,
}: {
  centralUrl: string;
  canManageVersionBadge?: boolean;
  defaultTab?: string;
  onCloseAutoFocus?: (event: Event) => void;
  sidebarTab?: SatelliteSidebarSettingsTab;
  user: WorkspaceUser | null;
}) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const navItems: SettingsNavGroup[] = [
    createAccountSettingsNavGroup(t),
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
      onCloseAutoFocus={onCloseAutoFocus}
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
    </SettingsDialogShell>
  );
}
