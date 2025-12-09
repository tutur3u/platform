'use client';

import {
  type CalendarPreferences,
  CalendarPreferencesProvider as UICalendarPreferencesProvider,
} from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import * as React from 'react';
import {
  firstDayToNumber,
  resolveCalendarSettings,
} from './calendar-settings-resolver';

interface CalendarPreferencesProviderProps {
  children: React.ReactNode;
  wsId?: string;
}

export function CalendarPreferencesProvider({
  children,
  wsId,
}: CalendarPreferencesProviderProps) {
  const locale = useLocale();

  // Fetch user calendar settings
  const { data: userSettings } = useQuery({
    queryKey: ['user-calendar-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/calendar-settings');
      if (!res.ok) return null;
      const data = await res.json();
      return data as {
        timezone?: string | null;
        first_day_of_week?: string | null;
        time_format?: string | null;
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch workspace calendar settings (if wsId is provided)
  const { data: workspaceSettings } = useQuery({
    queryKey: ['workspace-calendar-settings', wsId],
    queryFn: async () => {
      if (!wsId) return null;
      const res = await fetch(`/api/v1/workspaces/${wsId}/calendar-settings`);
      if (!res.ok) return null;
      const data = await res.json();
      return data as {
        timezone?: string | null;
        first_day_of_week?: string | null;
      };
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Resolve effective settings using priority system
  const preferences = React.useMemo((): CalendarPreferences => {
    const resolved = resolveCalendarSettings(
      userSettings,
      workspaceSettings,
      locale
    );

    return {
      weekStartsOn: firstDayToNumber(resolved.firstDayOfWeek, locale) as
        | 0
        | 1
        | 6,
      timezone: resolved.timezone,
      timeFormat: resolved.timeFormat,
    };
  }, [userSettings, workspaceSettings, locale]);

  return (
    <UICalendarPreferencesProvider value={preferences}>
      {children}
    </UICalendarPreferencesProvider>
  );
}
