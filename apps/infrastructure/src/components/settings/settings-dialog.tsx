'use client';

import { useQuery } from '@tanstack/react-query';
import { Keyboard, Paintbrush, PanelLeft, User } from '@tuturuuu/icons';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import { useSidebar } from '@tuturuuu/satellite/sidebar-context';
import {
  createWorkspaceSettingsNavGroup,
  SatelliteProfileSettingsPanel,
  SatelliteWorkspaceSettingsPanel,
} from '@tuturuuu/satellite/workspace-settings';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import { KeyboardShortcutsSettings } from '@tuturuuu/ui/custom/settings/keyboard-shortcuts-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface SettingsDialogProps {
  defaultTab?: string;
  user: WorkspaceUser | null;
  wsId?: string;
}

export function SettingsDialog({
  defaultTab = 'profile',
  user,
  wsId,
}: SettingsDialogProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );
  const { data: workspace } = useQuery({
    enabled: Boolean(wsId),
    queryFn: () => getWorkspace(wsId ?? ''),
    queryKey: ['workspace', wsId],
    staleTime: 5 * 60 * 1000,
  });

  const navItems = [
    ...(wsId ? [createWorkspaceSettingsNavGroup(t)] : []),
    {
      label: t('settings.user.title'),
      items: [
        {
          description: t('settings.user.profile_description'),
          icon: User,
          keywords: ['Profile', 'Account'],
          label: t('settings.user.profile'),
          name: 'profile',
        },
      ],
    },
    {
      label: t('settings.preferences.title'),
      items: [
        {
          description: t('settings-account.appearance-description'),
          icon: Paintbrush,
          keywords: ['Appearance', 'Theme'],
          label: t('settings.preferences.appearance'),
          name: 'appearance',
        },
        {
          description: t('settings.preferences.sidebar_description'),
          icon: PanelLeft,
          keywords: ['Sidebar', 'Navigation', 'Menu'],
          label: t('settings.preferences.sidebar'),
          name: 'sidebar',
        },
        {
          description: t('settings.preferences.keyboard_shortcuts_description'),
          icon: Keyboard,
          keywords: ['Keyboard', 'Shortcuts', 'Hotkeys'],
          label: t('settings.preferences.keyboard_shortcuts'),
          name: 'keyboard_shortcuts',
        },
      ],
    },
  ];

  return (
    <SettingsDialogShell
      activeTab={activeTab}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
      navItems={navItems}
      onActiveTabChange={setActiveTab}
    >
      <SatelliteWorkspaceSettingsPanel
        activeTab={activeTab}
        user={user}
        workspace={workspace ?? null}
        wsId={wsId}
      />

      {activeTab === 'profile' && user ? (
        <SatelliteProfileSettingsPanel user={user} />
      ) : null}

      {activeTab === 'appearance' ? (
        <div className="h-full">
          <AppearanceSettings
            canManageVersionBadge={isExactTuturuuuDotComEmail(user?.email)}
          />
        </div>
      ) : null}

      {activeTab === 'sidebar' ? (
        <div className="h-full">
          <SharedSidebarSettings useSidebar={useSidebar} />
        </div>
      ) : null}

      {activeTab === 'keyboard_shortcuts' ? (
        <div className="h-full">
          <KeyboardShortcutsSettings />
        </div>
      ) : null}
    </SettingsDialogShell>
  );
}
