'use client';

import { CalendarDayZoneBridgeProvider } from '@tuturuuu/ui/hooks/use-calendar-day-zone';
import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import { calendarDay, calendarToday } from '@tuturuuu/ui/lib/calendar-day';
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
const CALENDAR_VIEW_STORAGE_KEY = 'calendar-view-mode';
const CALENDAR_VIEWS: CalendarView[] = [
  'day',
  '4-days',
  'week',
  'month',
  'year',
  'agenda',
];

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

  useEffect(() => {
    const storedView = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
    const savedView = CALENDAR_VIEWS.find((item) => item === storedView);
    const isMobile = window.innerWidth <= 768;

    if (
      isMobile &&
      (!savedView ||
        savedView === 'week' ||
        savedView === '4-days' ||
        savedView === 'month')
    ) {
      setView('day');
      return;
    }

    if (savedView) setView(savedView);
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
