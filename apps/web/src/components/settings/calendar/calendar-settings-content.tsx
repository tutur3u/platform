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
import { NotificationSettings } from './notification-settings';
import { useCalendarSettings } from './settings-context';
import { SmartSchedulingSettings } from './smart-scheduling-settings';
import { TaskSettings } from './task-settings';
import { TimezoneSettings } from './timezone-settings';

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
  const { settings, updateSettings } = useCalendarSettings();

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
            title="Timezone"
            description="Set your calendar timezone"
          >
            <TimezoneSettings
              value={settings.timezone}
              onChange={(value) => updateSettings('timezone', value)}
            />
          </CalendarSettingsLayout>
        </div>
      );
    case 'calendar_colors':
      return (
        <CalendarSettingsLayout
          title="Category Colors"
          description="Customize colors for different event categories"
        >
          <CategoryColorsSettings
            value={settings.categoryColors}
            onChange={(value) => updateSettings('categoryColors', value)}
          />
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
    case 'calendar_smart':
      return (
        <div className="space-y-8">
          <CalendarSettingsLayout
            title="Smart Scheduling"
            description="Configure AI-powered scheduling preferences"
          >
            <SmartSchedulingSettings
              value={settings.smartScheduling}
              onChange={(value) => updateSettings('smartScheduling', value)}
            />
          </CalendarSettingsLayout>
          <CalendarSettingsLayout
            title="Task Settings"
            description="Manage task types and scheduling behavior"
          >
            <TaskSettings
              value={settings.taskSettings}
              onChange={(value) => updateSettings('taskSettings', value)}
            />
          </CalendarSettingsLayout>
          <CalendarSettingsLayout
            title="Event Notifications"
            description="Manage calendar event reminders and notifications"
          >
            <NotificationSettings
              value={settings.notifications}
              onChange={(value) => updateSettings('notifications', value)}
            />
          </CalendarSettingsLayout>
        </div>
      );
    default:
      return null;
  }
}
