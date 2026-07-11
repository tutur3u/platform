'use client';

import { useQuery } from '@tanstack/react-query';
import type { CalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import {
  firstDayToNumber,
  resolveCalendarSettings,
} from '@tuturuuu/utils/calendar-settings-resolver';
import { useEffect, useMemo } from 'react';

interface CalendarPreferencesSettingsBridgeProps {
  locale: string;
  onPreferencesChange: (preferences: CalendarPreferences) => void;
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

export function CalendarPreferencesSettingsBridge({
  locale,
  onPreferencesChange,
  wsId,
}: CalendarPreferencesSettingsBridgeProps) {
  const { data: userSettings } = useQuery({
    queryKey: ['users', 'calendar-settings'],
    queryFn: loadUserCalendarSettings,
    staleTime: 5 * 60 * 1000,
  });
  const { data: workspaceSettings } = useQuery({
    queryKey: ['workspace-calendar-settings', wsId],
    queryFn: () => loadWorkspaceCalendarSettings(wsId),
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });
  const preferences = useMemo((): CalendarPreferences => {
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
  }, [locale, userSettings, workspaceSettings]);

  useEffect(() => {
    onPreferencesChange(preferences);
  }, [onPreferencesChange, preferences]);

  return null;
}
