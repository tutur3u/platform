'use client';

import { Paintbrush } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import {
  SettingsDialogShell,
  type SettingsNavGroup,
} from '@tuturuuu/ui/custom/settings-dialog-shell';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createAccountSettingsNavGroup } from './account-settings-navigation';
import { SatelliteAccountSettingsPanel } from './account-settings-panel';

/**
 * Baseline settings dialog for satellites without an app-specific dialog:
 * the shared account tabs, appearance, and the onboarding guide.
 */
export function SatelliteDefaultSettingsDialog({
  centralUrl,
  defaultTab = 'profile',
  user,
}: {
  centralUrl: string;
  defaultTab?: string;
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
          canManageVersionBadge={isExactTuturuuuDotComEmail(user?.email)}
        />
      )}
    </SettingsDialogShell>
  );
}
