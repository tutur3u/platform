'use client';

import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface CalendarNavigationState {
  date: Date;
  setDate: Dispatch<SetStateAction<Date>>;
  setView: Dispatch<SetStateAction<CalendarView>>;
  view: CalendarView;
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
  const [date, setDate] = useState(() => new Date());
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
  const value = useMemo(() => ({ date, setDate, setView, view }), [date, view]);

  return (
    <CalendarNavigationContext.Provider value={value}>
      {children}
    </CalendarNavigationContext.Provider>
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
