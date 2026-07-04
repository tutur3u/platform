'use client';

import type { CalendarConnection, Workspace } from '@tuturuuu/types';
import { lazy } from 'react';
import { PanelSuspense } from './settings-dialog-lazy-panel-utils';

const LazyCalendarConnectionsUnified = lazy(
  () =>
    import('@tuturuuu/ui/calendar-app/components/calendar-connections-unified')
);
const LazyLunarCalendarSettings = lazy(() =>
  import('@tuturuuu/ui/custom/settings/lunar-calendar-settings').then(
    (module) => ({ default: module.LunarCalendarSettings })
  )
);
const LazyCalendarSyncProvider = lazy(() =>
  import('@tuturuuu/ui/hooks/use-calendar-sync').then((module) => ({
    default: module.CalendarSyncProvider,
  }))
);
const LazyCalendarSettingsContent = lazy(() =>
  import('./calendar/calendar-settings-content').then((module) => ({
    default: module.CalendarSettingsContent,
  }))
);
const LazyCalendarSettingsLayout = lazy(() =>
  import('./calendar/calendar-settings-layout').then((module) => ({
    default: module.CalendarSettingsLayout,
  }))
);
const LazyCalendarSettingsWrapper = lazy(() =>
  import('./calendar/calendar-settings-wrapper').then((module) => ({
    default: module.CalendarSettingsWrapper,
  }))
);

function getInitialCalendarSettings(workspace: Workspace | null) {
  if (!workspace) return undefined;

  return {
    timezone: {
      timezone: workspace.timezone || 'auto',
      showSecondaryTimezone: false,
    },
  };
}

interface CalendarBasePanelProps {
  description: string;
  title: string;
  workspace: Workspace | null;
  wsId?: string;
}

export function CalendarGeneralSettingsPanel({
  description,
  title,
  workspace,
  wsId,
}: CalendarBasePanelProps) {
  return (
    <PanelSuspense>
      <LazyCalendarSettingsWrapper
        wsId={wsId}
        initialSettings={getInitialCalendarSettings(workspace)}
      >
        <div className="h-full">
          <LazyCalendarSettingsLayout
            title={title}
            description={description}
            hideActions
          >
            <LazyLunarCalendarSettings />
          </LazyCalendarSettingsLayout>
        </div>
      </LazyCalendarSettingsWrapper>
    </PanelSuspense>
  );
}

interface CalendarIntegrationsSettingsPanelProps
  extends CalendarBasePanelProps {
  calendarConnections: CalendarConnection[];
  wsId: string;
}

export function CalendarIntegrationsSettingsPanel({
  calendarConnections,
  description,
  title,
  workspace,
  wsId,
}: CalendarIntegrationsSettingsPanelProps) {
  return (
    <PanelSuspense>
      <LazyCalendarSettingsWrapper
        wsId={wsId}
        initialSettings={getInitialCalendarSettings(workspace)}
      >
        <LazyCalendarSyncProvider
          wsId={wsId}
          initialCalendarConnections={calendarConnections}
        >
          <div className="h-full">
            <LazyCalendarSettingsLayout
              title={title}
              description={description}
              hideActions
            >
              <LazyCalendarConnectionsUnified wsId={wsId} variant="settings" />
            </LazyCalendarSettingsLayout>
          </div>
        </LazyCalendarSyncProvider>
      </LazyCalendarSettingsWrapper>
    </PanelSuspense>
  );
}

interface CalendarContentSettingsPanelProps {
  section: 'calendar_hours' | 'calendar_colors';
  workspace: Workspace | null;
  wsId: string;
}

export function CalendarContentSettingsPanel({
  section,
  workspace,
  wsId,
}: CalendarContentSettingsPanelProps) {
  return (
    <PanelSuspense>
      <LazyCalendarSettingsWrapper
        wsId={wsId}
        initialSettings={getInitialCalendarSettings(workspace)}
      >
        <LazyCalendarSettingsContent
          section={section}
          wsId={wsId}
          workspace={workspace}
        />
      </LazyCalendarSettingsWrapper>
    </PanelSuspense>
  );
}
