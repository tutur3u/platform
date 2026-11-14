'use client';

import { readInitialCalendarView } from '@tuturuuu/ui/hooks/calendar-default-view';
import { useCalendarClock } from '@tuturuuu/ui/hooks/use-calendar-clock';
import { CalendarDayZoneBridgeProvider } from '@tuturuuu/ui/hooks/use-calendar-day-zone';
import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import {
  calendarDay,
  calendarDayKey,
  calendarToday,
} from '@tuturuuu/ui/lib/calendar-day';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

interface CalendarNavigationState {
  date: Date;
  setDate: Dispatch<SetStateAction<Date>>;
  setView: Dispatch<SetStateAction<CalendarView>>;
  view: CalendarView;
  timezone?: string;
  goToToday: () => void;
}

const CalendarNavigationContext = createContext<CalendarNavigationState | null>(
  null
);

export function CalendarNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [date, setDateState] = useState(() => calendarToday());
  const [timezone, setZone] = useState<string>();
  const followsToday = useRef(true);
  const setDate: Dispatch<SetStateAction<Date>> = useCallback((next) => {
    followsToday.current = false;
    setDateState((previous) =>
      calendarDay(typeof next === 'function' ? next(previous) : next)
    );
  }, []);
  const setTimezone = useCallback((zone: string) => {
    setZone(zone);
    if (followsToday.current) setDateState(calendarToday(zone));
  }, []);
  const goToToday = useCallback(() => {
    followsToday.current = true;
    setDateState(calendarToday(timezone));
  }, [timezone]);
  const [view, setView] = useState<CalendarView>('week');
  // A date that follows today must cross local midnight with the today
  // markers, which read the same minute clock. The clock only triggers the
  // check; the day is read from the real time so the deterministic hydration
  // snapshot never becomes the selection. A picked date never moves.
  const clockMinute = useCalendarClock().getTime();
  useEffect(() => {
    if (!clockMinute || !followsToday.current) return;
    const today = calendarToday(timezone);
    setDateState((previous) =>
      calendarDayKey(previous) === calendarDayKey(today) ? previous : today
    );
  }, [clockMinute, timezone]);

  useEffect(() => {
    setView(readInitialCalendarView());
  }, []);
  const value = useMemo(
    () => ({ date, setDate, setView, view, timezone, goToToday }),
    [date, view, timezone, goToToday, setDate]
  );

  return (
    <CalendarDayZoneBridgeProvider value={{ timezone, setTimezone, goToToday }}>
      <CalendarNavigationContext.Provider value={value}>
        {children}
      </CalendarNavigationContext.Provider>
    </CalendarDayZoneBridgeProvider>
  );
}

export function useCalendarNavigation() {
  const value = useContext(CalendarNavigationContext);

  if (!value) {
    throw new Error(
      'useCalendarNavigation must be used within CalendarNavigationProvider'
    );
  }

  return value;
}
