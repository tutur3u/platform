'use client';

import {
  type CalendarPreferences,
  CalendarPreferencesProvider as UICalendarPreferencesProvider,
} from '@tuturuuu/ui/hooks/use-calendar-preferences';
import {
  firstDayToNumber,
  resolveCalendarSettings,
} from '@tuturuuu/utils/calendar-settings-resolver';
import { useLocale } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

interface CalendarPreferencesProviderProps {
  children: ReactNode;
  wsId?: string;
}

type CalendarPreferencesSettingsBridgeComponent = ComponentType<{
  locale: string;
  onPreferencesChange: (preferences: CalendarPreferences) => void;
  wsId?: string;
}>;

function areCalendarPreferencesEqual(
  current: CalendarPreferences,
  next: CalendarPreferences
): boolean {
  return (
    current.weekStartsOn === next.weekStartsOn &&
    current.timezone === next.timezone &&
    current.timeFormat === next.timeFormat
  );
}

function getDefaultCalendarPreferences(locale: string): CalendarPreferences {
  const resolved = resolveCalendarSettings(null, null, locale);

  return {
    weekStartsOn: firstDayToNumber(resolved.firstDayOfWeek, locale) as
      | 0
      | 1
      | 6,
    timezone: resolved.timezone,
    timeFormat: resolved.timeFormat,
  };
}

function useCalendarPreferencesSettingsBridge() {
  const [SettingsBridge, setSettingsBridge] =
    useState<CalendarPreferencesSettingsBridgeComponent | null>(null);

  useEffect(() => {
    let active = true;

    void import('./calendar-preferences-settings-bridge').then((module) => {
      if (active) {
        setSettingsBridge(() => module.CalendarPreferencesSettingsBridge);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return SettingsBridge;
}

export function CalendarPreferencesProvider({
  children,
  wsId,
}: CalendarPreferencesProviderProps) {
  const locale = useLocale();
  const [preferences, setPreferences] = useState<CalendarPreferences>(() =>
    getDefaultCalendarPreferences(locale)
  );
  const SettingsBridge = useCalendarPreferencesSettingsBridge();
  const handlePreferencesChange = useCallback(
    (nextPreferences: CalendarPreferences) => {
      setPreferences((currentPreferences) =>
        areCalendarPreferencesEqual(currentPreferences, nextPreferences)
          ? currentPreferences
          : nextPreferences
      );
    },
    []
  );

  return (
    <UICalendarPreferencesProvider value={preferences}>
      {SettingsBridge && (
        <SettingsBridge
          wsId={wsId}
          locale={locale}
          onPreferencesChange={handlePreferencesChange}
        />
      )}
      {children}
    </UICalendarPreferencesProvider>
  );
}
