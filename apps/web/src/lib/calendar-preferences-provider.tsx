'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type CalendarPreferences,
  CalendarPreferencesProvider as UICalendarPreferencesProvider,
} from '@tuturuuu/ui/hooks/use-calendar-preferences';
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

async function loadUserCalendarSettings() {
  const { getUserCalendarSettings } = await import(
    '@tuturuuu/internal-api/users'
  );

  return getUserCalendarSettings();
}

async function loadWorkspaceCalendarSettings(wsId?: string) {
  if (!wsId) return null;

  const { getWorkspaceCalendarSettings } = await import(
    '@tuturuuu/internal-api/settings'
  );

  return getWorkspaceCalendarSettings(wsId);
}

export function CalendarPreferencesProvider({
  children,
  wsId,
}: CalendarPreferencesProviderProps) {
  const locale = useLocale();

  // Fetch user calendar settings
  const { data: userSettings } = useQuery({
    queryKey: ['users', 'calendar-settings'],
    queryFn: loadUserCalendarSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch workspace calendar settings (if wsId is provided)
  const { data: workspaceSettings } = useQuery({
    queryKey: ['workspace-calendar-settings', wsId],
    queryFn: () => loadWorkspaceCalendarSettings(wsId),
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
