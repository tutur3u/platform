'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  CALENDAR_DEFAULT_VIEW_CONFIG_ID,
  CALENDAR_DEFAULT_VIEW_PREFERENCES,
  type CalendarDefaultViewPreference,
  parseCalendarDefaultViewPreference,
  writeCalendarDefaultViewMirror,
} from '@tuturuuu/ui/hooks/calendar-default-view';
import {
  useUpdateUserConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

const OPTION_KEYS = {
  auto: 'default_view_auto',
  last: 'default_view_last',
  day: 'default_view_day',
  week: 'default_view_week',
  month: 'default_view_month',
  agenda: 'default_view_agenda',
} as const satisfies Record<CalendarDefaultViewPreference, string>;

/** The view every calendar opens with, saved to the account. */
export function CalendarDefaultViewSettings() {
  const t = useTranslations('settings.calendar');
  const { data } = useUserConfig(CALENDAR_DEFAULT_VIEW_CONFIG_ID, 'auto');
  const updateConfig = useUpdateUserConfig();
  const preference = parseCalendarDefaultViewPreference(data);

  // The browser mirror lets the next calendar load open without waiting.
  useEffect(() => {
    if (data !== undefined) writeCalendarDefaultViewMirror(preference);
  }, [data, preference]);

  return (
    <SettingItemTab
      title={
        <Label htmlFor="calendar-default-view">{t('default_view')}</Label>
      }
      description={t('default_view_description')}
    >
      <Select
        value={preference}
        onValueChange={(value) => {
          const next = parseCalendarDefaultViewPreference(value);
          writeCalendarDefaultViewMirror(next);
          updateConfig.mutate({
            configId: CALENDAR_DEFAULT_VIEW_CONFIG_ID,
            value: next,
          });
        }}
      >
        <SelectTrigger id="calendar-default-view" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CALENDAR_DEFAULT_VIEW_PREFERENCES.map((option) => (
            <SelectItem key={option} value={option}>
              {t(OPTION_KEYS[option])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingItemTab>
  );
}
