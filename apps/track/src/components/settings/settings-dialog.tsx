'use client';

import {
  CalendarDays,
  ClipboardList,
  Clock,
  Coffee,
  Goal,
  Keyboard,
  LayoutGrid,
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
import { LunarCalendarSettings } from '@tuturuuu/ui/custom/settings/lunar-calendar-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';
import { TimeTrackerCategoriesSettings } from './time-tracker/time-tracker-categories-settings';
import { TimeTrackerGeneralSettings } from './time-tracker/time-tracker-general-settings';
import { TimeTrackerGoalsSettings } from './time-tracker/time-tracker-goals-settings';
import { TimeTrackerRequestsSettings } from './time-tracker/time-tracker-requests-settings';
import { WorkspaceBreakTypesSettings } from './time-tracker/workspace-break-types-settings';

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
    ...(wsId
      ? [
          {
            label: t('settings.time_tracker.title'),
            items: [
              {
                name: 'time_tracker_general',
                label: t('settings.time_tracker.general'),
                icon: Clock,
                description: t('settings.time_tracker.general_description'),
                keywords: ['Time tracker', 'Sessions', 'Heatmap'],
              },
              {
                name: 'time_tracker_categories',
                label: t('settings.time_tracker.categories'),
                icon: LayoutGrid,
                description: t('settings.time_tracker.categories_description'),
                keywords: ['Time tracker', 'Categories'],
              },
              {
                name: 'time_tracker_goals',
                label: t('settings.time_tracker.goals'),
                icon: Goal,
                description: t('settings.time_tracker.goals_description'),
                keywords: ['Time tracker', 'Goals', 'Productivity'],
              },
              {
                name: 'time_tracker_requests',
                label: t('settings.time_tracker.requests'),
                icon: ClipboardList,
                description: t('settings.time_tracker.requests_description'),
                keywords: ['Time tracker', 'Requests', 'Threshold'],
              },
              {
                name: 'break_types',
                label: t('settings.time_tracker.break_types'),
                icon: Coffee,
                description: t('settings.time_tracker.break_types_description'),
                keywords: ['Time tracker', 'Breaks'],
              },
            ],
          },
        ]
      : []),
    {
      label: t('settings.calendar.title'),
      items: [
        {
          name: 'calendar_general',
          label: t('settings.calendar.general'),
          icon: CalendarDays,
          description: t('settings.calendar.general_description'),
          keywords: ['Calendar', 'General', 'Lunar'],
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
          <SettingsWorkspaceBreadcrumb activeTab={activeTab} wsId={wsId} />
        ) : undefined
      }
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      primaryGroupLabels={[]}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
    >
      <SatelliteWorkspaceSettingsPanel
        activeTab={activeTab}
        user={user}
        wsId={wsId}
      />
      {activeTab === 'time_tracker_general' && wsId && (
        <TimeTrackerGeneralSettings wsId={wsId} />
      )}
      {activeTab === 'time_tracker_categories' && wsId && (
        <TimeTrackerCategoriesSettings wsId={wsId} />
      )}
      {activeTab === 'time_tracker_goals' && wsId && (
        <TimeTrackerGoalsSettings wsId={wsId} />
      )}
      {activeTab === 'time_tracker_requests' && wsId && (
        <TimeTrackerRequestsSettings wsId={wsId} canManageWorkspaceSettings />
      )}
      {activeTab === 'break_types' && wsId && (
        <WorkspaceBreakTypesSettings wsId={wsId} />
      )}
      {activeTab === 'calendar_general' && (
        <div className="h-full">
          <LunarCalendarSettings />
        </div>
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
