'use client';

import { useQuery } from '@tanstack/react-query';
import { Bot, Paintbrush, PanelLeft, User } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
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
  defaultTab = 'rewise_general',
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

      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) throw new Error('Not authenticated');

      const resolvedWsId = resolveWorkspaceId(wsId);

      const { data, error } = await supabase
        .from('workspaces')
        .select('*, workspace_members!inner(user_id)')
        .eq('id', resolvedWsId)
        .eq('workspace_members.user_id', currentUser.id)
        .single();

      if (error) throw new Error(error.message);

      const { workspace_members: _, ...workspaceData } = data;
      return workspaceData as Workspace;
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  // Rewise is the primary group — expanded by default, listed first.
  const rewiseLabel = t('settings.rewise.title');

  const navItems = [
    {
      label: rewiseLabel,
      items: [
        {
          name: 'rewise_general',
          label: t('settings.rewise.general'),
          icon: Bot,
          description: t('settings.rewise.general_description'),
          keywords: ['Rewise', 'General', 'AI'],
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
      primaryGroupLabels={[rewiseLabel]}
      expandAllAccordions={expandAllAccordions}
    >
      {activeTab === 'rewise_general' && workspace && (
        <div className="h-full">
          <div className="space-y-8">
            <div className="grid gap-6">
              <SettingItemTab
                title={t('settings.rewise.workspace_name')}
                description={t('settings.rewise.workspace_name_description')}
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
              title="Email"
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
