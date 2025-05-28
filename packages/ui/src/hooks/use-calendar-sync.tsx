import { createClient } from '@tuturuuu/supabase/next/client';
import dayjs from 'dayjs';
import { createContext, useContext, useState } from 'react';

const CalendarSyncContext = createContext<{
  currentView: 'day' | '4-day' | 'week' | 'month';
  setCurrentView: (view: 'day' | '4-day' | 'week' | 'month') => void;
  sync: () => void;
}>({
  currentView: 'day',
  setCurrentView: () => {},
  sync: () => {},
});

export const CalendarSyncProvider = ({
  children,
  wsId,
}: {
  children: React.ReactNode;
  wsId: string;
}) => {
  const [currentView, setCurrentView] = useState<
    'day' | '4-day' | 'week' | 'month'
  >('day');

  const sync = async () => {
    const supabase = createClient();

    const now = dayjs();
    let startDate: dayjs.Dayjs;
    let endDate: dayjs.Dayjs;

    // Calculate date range based on current view
    switch (currentView) {
      case 'day':
        startDate = now.startOf('day');
        endDate = now.endOf('day');
        break;

      case '4-day':
        startDate = now.startOf('day');
        endDate = now.add(3, 'day').endOf('day');
        break;

      case 'week':
        startDate = now.startOf('week').add(1, 'day'); // Start from Monday
        endDate = now.startOf('week').add(7, 'day').endOf('day'); // End on Sunday
        break;

      case 'month':
        startDate = now.startOf('month');
        endDate = now.endOf('month');
        break;

      default:
        startDate = now.startOf('day');
        endDate = now.endOf('day');
    }

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', wsId)
      .gte('start_at', startDate.toISOString())
      .lte('end_at', endDate.toISOString())
      .order('start_at', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    console.log(data.map((event) => event.title));
  };

  const value = {
    currentView,
    setCurrentView,
    sync,
  };

  return (
    <CalendarSyncContext.Provider value={value}>
      {children}
    </CalendarSyncContext.Provider>
  );
};

export const useCalendarSync = () => {
  const context = useContext(CalendarSyncContext);
  if (context === undefined)
    throw new Error(
      'useCalendarSync() must be used within a CalendarSyncProvider.'
    );
  return context;
};
