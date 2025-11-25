'use client';

import * as React from 'react';

export type CalendarPreferences = {
  weekStartsOn?: 0 | 1 | 6;
  timezone?: string;
};

const CalendarPreferencesContext = React.createContext<
  CalendarPreferences | undefined
>(undefined);

export function useCalendarPreferences(): CalendarPreferences {
  const context = React.useContext(CalendarPreferencesContext);

  // Return default preferences if context is not available
  // weekStartsOn: 0 (Sunday) is react-day-picker's default
  return context ?? { weekStartsOn: 0, timezone: 'auto' };
}

export const CalendarPreferencesProvider = CalendarPreferencesContext.Provider;
