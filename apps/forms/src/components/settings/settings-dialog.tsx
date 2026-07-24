'use client';

import {
  FileText,
  Keyboard,
  Paintbrush,
  PanelLeft,
  User,
} from '@tuturuuu/icons';
import {
  createWorkspaceSettingsNavGroup,
  SatelliteProfileSettingsPanel,
  SatelliteWorkspaceSettingsPanel,
  SettingsWorkspaceBreadcrumb,
} from '@tuturuuu/satellite/workspace-settings';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import { KeyboardShortcutsSettings } from '@tuturuuu/ui/custom/settings/keyboard-shortcuts-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { FormsAutosaveSettings } from './forms-autosave-settings';

interface SettingsDialogProps {
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
}

export function SettingsDialog({
  wsId,
  user,
  defaultTab = 'profile',
}: SettingsDialogProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );

  const navItems = [
    {
      label: t('settings.preferences.forms'),
      items: [
        {
          name: 'forms_autosave',
          label: t('settings.preferences.forms_autosave'),
          icon: FileText,
          description: t('settings.preferences.forms_autosave_description'),
          keywords: ['Forms', 'Auto-save', 'Drafts'],
        },
      ],
    },
    ...(wsId ? [createWorkspaceSettingsNavGroup(t)] : []),
    {
      label: t('settings.user.title'),
      items: [
        {
          name: 'profile',
          label: t('settings.user.profile'),
          icon: User,
          description: t('settings.user.profile_description'),
          keywords: ['Profile'],
        },
      ],
    },
    {
      label: t('settings.preferences.title'),
      items: [
        {
          name: 'appearance',
          label: t('settings.preferences.appearance'),
          icon: Paintbrush,
          description: t('settings-account.appearance-description'),
          keywords: ['Appearance', 'Theme'],
        },
        {
          name: 'sidebar',
          label: t('settings.preferences.sidebar'),
          icon: PanelLeft,
          description: t('settings.preferences.sidebar_description'),
          keywords: ['Sidebar', 'Navigation', 'Menu'],
        },
        {
          name: 'keyboard_shortcuts',
          label: t('settings.preferences.keyboard_shortcuts'),
          icon: Keyboard,
          description: t('settings.preferences.keyboard_shortcuts_description'),
          keywords: ['Keyboard', 'Shortcuts', 'Hotkeys'],
        },
      ],
    },
  ];

  return (
    <SettingsDialogShell
      activeGroupBreadcrumb={
        wsId && activeTab.startsWith('workspace_') ? (
          <SettingsWorkspaceBreadcrumb
            activeTab={activeTab}
            appId="forms"
            wsId={wsId}
          />
        ) : undefined
      }
      activeTab={activeTab}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
      navItems={navItems}
      onActiveTabChange={setActiveTab}
    >
      <SatelliteWorkspaceSettingsPanel
        activeTab={activeTab}
        user={user}
        wsId={wsId}
      />

      {activeTab === 'forms_autosave' && <FormsAutosaveSettings />}

      {activeTab === 'profile' && user && (
        <SatelliteProfileSettingsPanel user={user} />
      )}

      {activeTab === 'appearance' && (
        <div className="h-full">
          <AppearanceSettings
            canManageVersionBadge={isExactTuturuuuDotComEmail(user?.email)}
          />
        </div>
      )}

      {activeTab === 'sidebar' && (
        <div className="h-full">
          <SharedSidebarSettings useSidebar={useSidebar} />
        </div>
      )}

      {activeTab === 'keyboard_shortcuts' && (
        <div className="h-full">
          <KeyboardShortcutsSettings />
        </div>
      )}
    </SettingsDialogShell>
  );
}
