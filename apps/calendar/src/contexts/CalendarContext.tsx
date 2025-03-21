'use client';

import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

export type CalendarView = 'day' | '4-days' | 'week' | 'month';

interface CalendarContextType {
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  view: CalendarView;
  setView: React.Dispatch<React.SetStateAction<CalendarView>>;
  availableViews: { value: string; label: string; disabled?: boolean }[];
  setAvailableViews: React.Dispatch<
    React.SetStateAction<{ value: string; label: string; disabled?: boolean }[]>
  >;
}

const CalendarContext = createContext<CalendarContextType | undefined>(
  undefined
);

interface CalendarProviderProps {
  children: ReactNode;
  defaultLabels?: {
    day: string;
    '4-days': string;
    week: string;
    month: string;
  };
}

export function CalendarProvider({
  children,
  defaultLabels = {
    day: 'Day',
    '4-days': '4 Days',
    week: 'Week',
    month: 'Month',
  },
}: CalendarProviderProps) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) setInitialized(true);
  }, [initialized]);

  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [availableViews, setAvailableViews] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >([
    {
      value: 'day',
      label: defaultLabels.day,
      disabled: false,
    },
    {
      value: '4-days',
      label: defaultLabels['4-days'],
      disabled: initialized ? window.innerWidth <= 768 : false,
    },
    {
      value: 'week',
      label: defaultLabels.week,
      disabled: initialized ? window.innerWidth <= 768 : false,
    },
    {
      value: 'month',
      label: defaultLabels.month,
      disabled: false,
    },
  ]);

  const value = {
    date,
    setDate,
    view,
    setView,
    availableViews,
    setAvailableViews,
  };

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendarContext() {
  const context = useContext(CalendarContext);
  if (context === undefined) {
    throw new Error(
      'useCalendarContext must be used within a CalendarProvider'
    );
  }
  return context;
}
