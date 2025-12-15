'use client';

import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types';
import type { CalendarSettings } from '@tuturuuu/ui/legacy/calendar/settings/settings-context';
import { useMemo } from 'react';
import {
  resolveFirstDayOfWeek,
  resolveTimeFormat,
  resolveTimezone,
} from '@/lib/calendar-settings-resolver';

interface UserCalendarSettings {
  timezone: string;
  first_day_of_week: string;
  time_format: string;
}

/**
 * Return type for the useCalendarSettings hook
 */
export interface UseCalendarSettingsResult {
  initialSettings: Partial<CalendarSettings>;
  needsCalendarGate: boolean;
}

export function useCalendarSettings(
  workspace: Workspace,
  locale: string
): UseCalendarSettingsResult {
  const { data: userSettings } = useQuery({
    queryKey: ['user-calendar-settings'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/v1/users/calendar-settings');
        if (!res.ok) {
          const errorBody = await res.text().catch(() => 'Unknown error');
          const error = new Error(
            `Failed to fetch calendar settings: ${res.status} ${res.statusText} - ${errorBody}`
          );
          console.error('[useCalendarSettings] API error:', error.message);
          throw error;
        }
        return res.json() as Promise<UserCalendarSettings>;
      } catch (error) {
        console.error('[useCalendarSettings] Fetch error:', error);
        throw error;
      }
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
