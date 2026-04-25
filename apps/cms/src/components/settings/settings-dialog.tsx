'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gamepad2, Paintbrush, PanelLeft, User } from '@tuturuuu/icons';
import {
  ENABLE_CMS_GAMES_CONFIG_ID,
  getOptionalWorkspaceConfig,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';
import { isCmsGamesConfigEnabled } from '@/lib/cms-games-shared';

interface SettingsDialogProps {
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
}

function CmsGamesSetting({
  description,
  disabled,
  enabled,
  onToggle,
  title,
  toggleLabel,
}: {
  description: string;
  disabled: boolean;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  title: string;
  toggleLabel: string;
}) {
  return (
    <SettingItemTab title={title} description={description}>
      <div className="flex items-center gap-3">
        <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-muted-foreground text-xs">
          {ENABLE_CMS_GAMES_CONFIG_ID}={enabled ? 'true' : 'false'}
        </span>
        <Switch
          aria-label={toggleLabel}
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
      </div>
    </SettingItemTab>
  );
}

export function SettingsDialog({
  wsId,
  user,
  defaultTab = 'cms_general',
}: SettingsDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const cmsGamesQueryKey = [
    'workspace-config',
    wsId,
    ENABLE_CMS_GAMES_CONFIG_ID,
  ];

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
  const { data: cmsGamesConfig, isLoading: cmsGamesLoading } = useQuery({
    queryKey: cmsGamesQueryKey,
    queryFn: async () => {
      if (!wsId) throw new Error('No workspace ID');
      return getOptionalWorkspaceConfig(wsId, ENABLE_CMS_GAMES_CONFIG_ID);
    },
    enabled: !!wsId,
  });

  const cmsGamesEnabled = isCmsGamesConfigEnabled(cmsGamesConfig?.value);
  const updateCmsGamesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!wsId) throw new Error('No workspace ID');
      await updateWorkspaceConfig(
        wsId,
        ENABLE_CMS_GAMES_CONFIG_ID,
        enabled ? 'true' : 'false'
      );
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData(cmsGamesQueryKey, {
        value: enabled ? 'true' : 'false',
      });
      void queryClient.invalidateQueries({ queryKey: cmsGamesQueryKey });
      router.refresh();
      toast.success(
        t(
          enabled
            ? 'external-projects.settings.cms_games_enabled_toast'
            : 'external-projects.settings.cms_games_disabled_toast'
        )
      );
    },
    onError: () => {
      toast.error(t('external-projects.settings.cms_games_error_toast'));
    },
  });

  const cmsLabel = 'CMS';
  const cmsGamesSetting = (
    <CmsGamesSetting
      description={t('external-projects.settings.cms_games_description')}
      disabled={cmsGamesLoading || updateCmsGamesMutation.isPending}
      enabled={cmsGamesEnabled}
      onToggle={(enabled) => updateCmsGamesMutation.mutate(enabled)}
      title={t('external-projects.settings.cms_games_title')}
      toggleLabel={t('external-projects.settings.cms_games_toggle_label')}
    />
  );

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
        {
          name: 'cms_games',
          label: t('external-projects.settings.cms_games_nav_title'),
          icon: Gamepad2,
          description: t('external-projects.settings.cms_games_description'),
          keywords: ['CMS', 'Games', 'WebGL'],
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
              {cmsGamesSetting}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cms_games' && (
        <div className="h-full">
          <div className="space-y-8">
            <div className="grid gap-6">{cmsGamesSetting}</div>
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
