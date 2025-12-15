'use client';

import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types';
import type { CalendarSettings } from '@tuturuuu/ui/legacy/calendar/settings/settings-context';
import { useMemo } from 'react';
import {
  resolveFirstDayOfWeek,
  resolveTimeFormat,
  resolveTimezone,
} from '../../../../../../lib/calendar-settings-resolver';

interface UserCalendarSettings {
  timezone: string;
  first_day_of_week: string;
  time_format: string;
}

export function useCalendarSettings(workspace: Workspace, locale: string) {
  const { data: userSettings } = useQuery({
    queryKey: ['user-calendar-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/calendar-settings');
      if (!res.ok) return null;
      return res.json() as Promise<UserCalendarSettings>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const initialSettings = useMemo((): Partial<CalendarSettings> => {
    const effectiveFirstDay = resolveFirstDayOfWeek(
      { first_day_of_week: userSettings?.first_day_of_week },
      { first_day_of_week: workspace.first_day_of_week },
      locale
    );

    const effectiveTimezone = resolveTimezone(
      { timezone: userSettings?.timezone },
      { timezone: workspace.timezone }
    );

    const effectiveTimeFormat = resolveTimeFormat(
      { time_format: userSettings?.time_format },
      locale
    );

    return {
      appearance: {
        firstDayOfWeek: effectiveFirstDay,
        showWeekends: true,
        theme: 'system',
        timeFormat: effectiveTimeFormat,
        defaultView: 'week',
        showWeekNumbers: false,
        showDeclinedEvents: false,
        compactView: false,
      },
      timezone: {
        timezone: effectiveTimezone,
        showSecondaryTimezone: false,
      },
    };
  }, [
    userSettings?.first_day_of_week,
    userSettings?.timezone,
    userSettings?.time_format,
    workspace.first_day_of_week,
    workspace.timezone,
    locale,
  ]);

  const needsCalendarGate =
    !workspace.timezone ||
    workspace.timezone === 'auto' ||
    !workspace.first_day_of_week ||
    workspace.first_day_of_week === 'auto';

  return {
    initialSettings,
    needsCalendarGate,
  };
}
