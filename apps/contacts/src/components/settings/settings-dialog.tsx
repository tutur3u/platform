'use client';

import {
  ClipboardList,
  FileText,
  Keyboard,
  Paintbrush,
  PanelLeft,
  Star,
  User,
  Users,
} from '@tuturuuu/icons';
import {
  DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  parseWorkspaceConfigIdList,
} from '@tuturuuu/internal-api/workspace-configs';
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
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';
import { ApprovalsSettings } from './approvals-settings';
import AttendanceDisplaySettings from './attendance-display-settings';
import { ReportDefaultTitleSettings } from './report-default-title-settings';
import { DatabaseDefaultFiltersSettings } from './users/database-default-filters-settings';
import FeaturedGroupsSettings from './users/featured-groups-settings';
import { RequireAttentionColorSettings } from './users/require-attention-color-settings';
import UsersManagementSettings from './users/users-management-settings';

interface SettingsDialogProps {
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
}

export function SettingsDialog({
  wsId,
  user,
  defaultTab = 'database_filters',
}: SettingsDialogProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );

  const {
    data: workspaceCustomConfigs = {},
    isLoading: isLoadingWorkspaceCustomConfigs,
  } = useWorkspaceConfigs(
    wsId ?? '',
    wsId
      ? [
          DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
          DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
          DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
          DATABASE_FEATURED_GROUPS_CONFIG_ID,
        ]
      : []
  );

  const autoAddNewGroupsToDefaultIncludedGroups =
    workspaceCustomConfigs[
      DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
    ] === 'true';
  const defaultExcludedGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID]
  );
  const defaultIncludedGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID]
  );
  const featuredGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_FEATURED_GROUPS_CONFIG_ID]
  );

  const userManagementLabel = t('settings.user_management.title');
  const navItems = [
    ...(wsId
      ? [
          {
            label: userManagementLabel,
            items: [
              {
                name: 'database_filters',
                label: t('settings.user_management.database_filters'),
                icon: Users,
                description: t(
                  'settings.user_management.database_filters_description'
                ),
                keywords: [
                  'Users',
                  'Database',
                  'Filters',
                  'Groups',
                  'Excluded',
                ],
              },
              {
                name: 'featured_groups',
                label: t('settings.user_management.featured_groups'),
                icon: Star,
                description: t(
                  'settings.user_management.featured_groups_description'
                ),
                keywords: ['Featured', 'Groups', 'Quick', 'Filter', 'Pinned'],
              },
              {
                name: 'require_attention_color',
                label: t('settings.user_management.require_attention_color'),
                icon: Paintbrush,
                description: t(
                  'settings.user_management.require_attention_color_description'
                ),
                keywords: ['Users', 'Feedback', 'Attention', 'Color'],
              },
              {
                name: 'approvals',
                label: t('settings.approvals.title'),
                icon: ClipboardList,
                description: t('settings.approvals.description'),
                keywords: ['Approvals', 'Posts', 'Reports'],
              },
            ],
          },
          {
            label: t('settings.attendance.title'),
            items: [
              {
                name: 'attendance_display',
                label: t('settings.attendance.display'),
                icon: ClipboardList,
                description: t('settings.attendance.display_description'),
                keywords: ['Attendance', 'Managers', 'Totals'],
              },
            ],
          },
          {
            label: t('settings.reports.title'),
            items: [
              {
                name: 'report_default_title',
                label: t('settings.reports.default_title'),
                icon: FileText,
                description: t('settings.reports.default_title_description'),
                keywords: ['Reports', 'Default title'],
              },
            ],
          },
        ]
      : []),
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
            appId="contacts"
            wsId={wsId}
          />
        ) : undefined
      }
      activeTab={activeTab}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
      navItems={navItems}
      onActiveTabChange={setActiveTab}
      primaryGroupLabels={[userManagementLabel]}
    >
      <SatelliteWorkspaceSettingsPanel
        activeTab={activeTab}
        user={user}
        wsId={wsId}
      />
      {activeTab === 'database_filters' && wsId && (
        <div className="space-y-8">
          <DatabaseDefaultFiltersSettings />
          <UsersManagementSettings
            initialAutoAddNewGroupsToDefaultIncludedGroups={
              autoAddNewGroupsToDefaultIncludedGroups
            }
            initialIncludedGroupIds={defaultIncludedGroupIds}
            initialSelectedGroupIds={defaultExcludedGroupIds}
            isConfigLoading={isLoadingWorkspaceCustomConfigs}
            wsId={wsId}
          />
        </div>
      )}

      {activeTab === 'featured_groups' && wsId && (
        <div className="h-full">
          <FeaturedGroupsSettings
            initialSelectedGroupIds={featuredGroupIds}
            isConfigLoading={isLoadingWorkspaceCustomConfigs}
            wsId={wsId}
          />
        </div>
      )}

      {activeTab === 'require_attention_color' && (
        <div className="h-full">
          <RequireAttentionColorSettings />
        </div>
      )}

      {activeTab === 'attendance_display' && wsId && (
        <AttendanceDisplaySettings wsId={wsId} />
      )}

      {activeTab === 'approvals' && wsId && <ApprovalsSettings wsId={wsId} />}

      {activeTab === 'report_default_title' && wsId && (
        <ReportDefaultTitleSettings workspaceId={wsId} />
      )}

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
