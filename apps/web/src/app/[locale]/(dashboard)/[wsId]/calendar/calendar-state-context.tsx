'use client';

import { type ReactNode, createContext, useContext, useState } from 'react';

type CalendarView = 'day' | '4-days' | 'week' | 'month';

interface CalendarStateContextType {
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  view: CalendarView;
  setView: React.Dispatch<React.SetStateAction<CalendarView>>;
  availableViews: { value: string; label: string; disabled?: boolean }[];
  setAvailableViews: React.Dispatch<
    React.SetStateAction<{ value: string; label: string; disabled?: boolean }[]>
  >;
}

const CalendarStateContext = createContext<
  CalendarStateContextType | undefined
>(undefined);

// Default available views
const defaultAvailableViews = [
  { value: 'day', label: 'Day', disabled: false },
  { value: '4-days', label: '4 Days', disabled: false },
  { value: 'week', label: 'Week', disabled: false },
  { value: 'month', label: 'Month', disabled: false },
];

export function CalendarStateProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [availableViews, setAvailableViews] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >(defaultAvailableViews);

  return (
    <CalendarStateContext.Provider
      value={{
        date,
        setDate,
        view,
        setView,
        availableViews,
        setAvailableViews,
      }}
    >
      {children}
    </CalendarStateContext.Provider>
  );
}

export function useCalendarState() {
  const context = useContext(CalendarStateContext);
  if (context === undefined) {
    throw new Error(
      'useCalendarState must be used within a CalendarStateProvider'
    );
  }
  return context;
}
