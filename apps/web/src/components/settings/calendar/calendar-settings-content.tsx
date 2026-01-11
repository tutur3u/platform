'use client';

import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import { CalendarSettingsLayout } from './calendar-settings-layout';
import { CategoryColorsSettings } from './category-color-settings';
import { GoogleCalendarSettings } from './google-calendar-settings';
import { HoursSettings } from './hour-settings';
import { WorkspaceCalendarPreferences } from './workspace-calendar-preferences';

interface CalendarSettingsContentProps {
  section: string;
  wsId: string;
  workspace?: Workspace | null;
  calendarToken?: WorkspaceCalendarGoogleToken | null;
  calendarConnections?: CalendarConnection[];
}

export function CalendarSettingsContent({
  section,
  wsId,
  workspace,
  calendarToken,
  calendarConnections = [],
}: CalendarSettingsContentProps) {
  switch (section) {
    case 'calendar_hours':
      return (
        <div className="space-y-8">
          <CalendarSettingsLayout
            title="Hours"
            description="Configure your work, meeting, and personal hours"
            hideActions
          >
            <HoursSettings wsId={wsId} workspace={workspace} />
          </CalendarSettingsLayout>
          <CalendarSettingsLayout
            title="Timezone & First Day of Week"
            description="Set workspace-level calendar preferences"
            hideActions
          >
            <WorkspaceCalendarPreferences wsId={wsId} workspace={workspace} />
          </CalendarSettingsLayout>
        </div>
      );
    case 'calendar_colors':
      return (
        <CalendarSettingsLayout
          title="Category Colors"
          description="Customize colors for different event categories"
          hideActions
        >
          <CategoryColorsSettings workspace={workspace ?? null} />
        </CalendarSettingsLayout>
      );
    case 'calendar_google':
      return (
        <CalendarSettingsLayout
          title="Integrations"
          description="Connect your Google Calendar and other services"
          hideActions
        >
          <GoogleCalendarSettings
            wsId={wsId}
            workspace={workspace}
            experimentalGoogleToken={calendarToken}
            calendarConnections={calendarConnections}
          />
        </CalendarSettingsLayout>
      );
    default:
      return null;
  }
}
