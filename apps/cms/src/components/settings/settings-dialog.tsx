'use client';

import { useQuery } from '@tanstack/react-query';
import { Paintbrush, PanelLeft, User } from '@tuturuuu/icons';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';

interface SettingsDialogProps {
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
}

export function SettingsDialog({
  wsId,
  user,
  defaultTab = 'cms_general',
}: SettingsDialogProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);

  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );

  // Fetch workspace for settings
  const { data: workspace } = useQuery({
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      if (!wsId) throw new Error('No workspace ID');
      return getWorkspace(wsId);
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  const cmsLabel = 'CMS';

  const navItems = [
    {
      label: cmsLabel,
      items: [
        {
          name: 'cms_general',
          label: t('common.overview'),
          icon: PanelLeft,
          description: t('external-projects.settings.description'),
          keywords: ['CMS', 'Content', 'Publishing'],
        },
      ],
    },
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
      ],
    },
  ];

  return (
    <SettingsDialogShell
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      primaryGroupLabels={[cmsLabel]}
      expandAllAccordions={expandAllAccordions}
    >
      {activeTab === 'cms_general' && workspace && (
        <div className="h-full">
          <div className="space-y-8">
            <div className="grid gap-6">
              <SettingItemTab
                title={t('common.workspace')}
                description={t('external-projects.settings.description')}
              >
                <span className="text-muted-foreground text-sm">
                  {workspace.name || t('common.unnamed')}
                </span>
              </SettingItemTab>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profile' && user && (
        <div className="space-y-8">
          <div className="grid gap-6">
            <SettingItemTab
              title={t('settings-account.display-name')}
              description={t('settings-account.display-name-description')}
            >
              <span className="text-muted-foreground text-sm">
                {user?.display_name || t('common.unnamed')}
              </span>
            </SettingItemTab>
            <SettingItemTab
              title={t('common.email')}
              description={t('settings-account.email-description')}
            >
              <span className="text-muted-foreground text-sm">
                {user?.email || '—'}
              </span>
            </SettingItemTab>
          </div>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="h-full">
          <AppearanceSettings />
        </div>
      )}

      {activeTab === 'sidebar' && (
        <div className="h-full">
          <SharedSidebarSettings useSidebar={useSidebar} />
        </div>
      )}
    </SettingsDialogShell>
  );
}
