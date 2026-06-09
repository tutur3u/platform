'use client';

import type { Workspace } from '@tuturuuu/types';
import { CalendarSettingsLayout } from './calendar-settings-layout';
import { CategoryColorsSettings } from './category-color-settings';
import { HoursSettings } from './hour-settings';
import { WorkspaceCalendarPreferences } from './workspace-calendar-preferences';

interface CalendarSettingsContentProps {
  section: string;
  wsId: string;
  workspace?: Workspace | null;
}

export function CalendarSettingsContent({
  section,
  wsId,
  workspace,
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
    default:
      return null;
  }
}
