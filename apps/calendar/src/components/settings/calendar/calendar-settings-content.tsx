'use client';

import type { Workspace } from '@tuturuuu/types';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('calendar_settings');

  switch (section) {
    case 'calendar_hours':
      return (
        <div className="space-y-8">
          <CalendarSettingsLayout
            title={t('sections.hours.title')}
            description={t('sections.hours.description')}
          >
            <HoursSettings wsId={wsId} workspace={workspace} />
          </CalendarSettingsLayout>
          <CalendarSettingsLayout
            title={t('sections.preferences.title')}
            description={t('sections.preferences.description')}
          >
            <WorkspaceCalendarPreferences wsId={wsId} workspace={workspace} />
          </CalendarSettingsLayout>
        </div>
      );
    case 'calendar_colors':
      return (
        <CalendarSettingsLayout
          title={t('sections.colors.title')}
          description={t('sections.colors.description')}
        >
          <CategoryColorsSettings workspace={workspace ?? null} />
        </CalendarSettingsLayout>
      );
    default:
      return null;
  }
}
