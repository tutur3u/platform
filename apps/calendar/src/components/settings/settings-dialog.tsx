'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Clock,
  Keyboard,
  LayoutGrid,
  Palette,
  PanelLeft,
  User,
} from '@tuturuuu/icons';
import { listCalendarConnections } from '@tuturuuu/internal-api/calendar';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import {
  createWorkspaceSettingsNavGroup,
  SatelliteProfileSettingsPanel,
  SatelliteWorkspaceSettingsPanel,
  SettingsWorkspaceBreadcrumb,
} from '@tuturuuu/satellite/workspace-settings';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import CalendarConnectionsUnified from '@tuturuuu/ui/calendar-app/components/calendar-connections-unified';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import { KeyboardShortcutsSettings } from '@tuturuuu/ui/custom/settings/keyboard-shortcuts-settings';
import { LunarCalendarSettings } from '@tuturuuu/ui/custom/settings/lunar-calendar-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';
import { CalendarSettingsContent } from './calendar/calendar-settings-content';
import { CalendarSettingsWrapper } from './calendar/calendar-settings-wrapper';

interface SettingsDialogProps {
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
}

export function SettingsDialog({
  wsId,
  user,
  defaultTab = 'calendar_general',
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

  const { data: calendarConnections = [] } = useQuery({
    queryKey: ['calendar-connections', wsId],
    queryFn: async () => {
      if (!wsId) return [];
      return listCalendarConnections(wsId);
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  // Calendar is the primary group — expanded by default, listed first.
  // All other groups are collapsed by default.
  const calendarLabel = t('settings.calendar.title');

  const navItems = [
    {
      label: calendarLabel,
      items: [
        {
          name: 'calendar_general',
          label: t('settings.calendar.general'),
          icon: CalendarDays,
          description: t('settings.calendar.general_description'),
          keywords: ['Calendar', 'General', 'Lunar'],
        },
        ...(wsId
          ? [
              {
                name: 'calendar_hours',
                label: t('settings.calendar.hours'),
                icon: Clock,
                description: t('settings.calendar.hours_description'),
                keywords: ['Calendar', 'Hours', 'Timezone'],
              },
              {
                name: 'calendar_colors',
                label: t('settings.calendar.colors'),
                icon: LayoutGrid,
                description: t('settings.calendar.colors_description'),
                keywords: ['Calendar', 'Colors', 'Categories'],
              },
              {
                name: 'calendar_integrations',
                label: t('settings.calendar.integrations'),
                icon: CalendarDays,
                description: t('settings.calendar.integrations_description'),
                keywords: ['Calendar', 'Integrations', 'Google', 'Outlook'],
              },
            ]
          : []),
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
          icon: Palette,
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
      primaryGroupLabels={[calendarLabel]}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
    >
      <SatelliteWorkspaceSettingsPanel
        activeTab={activeTab}
        user={user}
        workspace={workspace ?? null}
        wsId={wsId}
      />
      {activeTab === 'calendar_general' && (
        <div className="h-full">
          <LunarCalendarSettings />
        </div>
      )}

      {(activeTab === 'calendar_hours' || activeTab === 'calendar_colors') &&
        wsId && (
          <CalendarSettingsWrapper wsId={wsId}>
            <div className="h-full">
              <CalendarSettingsContent
                section={activeTab}
                wsId={wsId}
                workspace={workspace ?? null}
              />
            </div>
          </CalendarSettingsWrapper>
        )}

      {activeTab === 'calendar_integrations' && wsId && (
        <CalendarSyncProvider
          wsId={wsId}
          initialCalendarConnections={calendarConnections}
        >
          <div className="h-full">
            <CalendarConnectionsUnified wsId={wsId} variant="settings" />
          </div>
        </CalendarSyncProvider>
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
