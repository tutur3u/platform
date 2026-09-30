'use client';
import { createContext, useContext } from 'react';
export type CalendarDayZone = {
  timezone?: string;
  setTimezone: (zone: string) => void;
  goToToday?: () => void;
};
const CalendarDayZoneContext = createContext<CalendarDayZone | null>(null);
export const CalendarDayZoneBridgeProvider = CalendarDayZoneContext.Provider;
export function useCalendarDayZone() {
  return useContext(CalendarDayZoneContext);
}
