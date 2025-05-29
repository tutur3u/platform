import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceCalendarEvent } from '@tuturuuu/types/db';
import dayjs from 'dayjs';
import { createContext, useContext, useState } from 'react';

const CalendarSyncContext = createContext<{
  data: WorkspaceCalendarEvent[] | null;
  googleData: WorkspaceCalendarEvent[] | null;
  error: Error | null;
  currentView: 'day' | '4-day' | 'week' | 'month';
  setCurrentView: (view: 'day' | '4-day' | 'week' | 'month') => void;
  syncToTuturuuu: (progressCallback?: (progress: {
    phase: 'get' | 'fetch' | 'upsert' | 'complete';
    percentage: number;
    statusMessage: string;
    changesMade: boolean;
  }) => void) => Promise<void>;
  syncToGoogle: () => Promise<void>;
}>({
  data: null,
  googleData: null,
  error: null,
  currentView: 'day',
  setCurrentView: () => {},
  syncToTuturuuu: async (progressCallback?: (progress: {
    phase: 'get' | 'fetch' | 'upsert' | 'complete';
    percentage: number;
    statusMessage: string;
    changesMade: boolean;
  }) => void) => {},
  syncToGoogle: async () => {},
});

export const CalendarSyncProvider = ({
  children,
  wsId,
}: {
  children: React.ReactNode;
  wsId: string;
}) => {
  const [data, setData] = useState<WorkspaceCalendarEvent[] | null>(null);
  const [googleData, setGoogleData] = useState<WorkspaceCalendarEvent[] | null>(
    null
  );
  const [error, setError] = useState<Error | null>(null);
  const [currentView, setCurrentView] = useState<
    'day' | '4-day' | 'week' | 'month'
  >('day');

  const syncToTuturuuu = async (progressCallback?: (progress: {
    phase: 'get' | 'fetch' | 'upsert' | 'complete';
    percentage: number;
    statusMessage: string;
    changesMade: boolean;
  }) => void) => {
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

    // Report get phase starting
    if (progressCallback) {
      progressCallback({
        phase: 'get',
        percentage: 0,
        statusMessage: 'Fetching events from database...',
        changesMade: false
      });
      await new Promise(resolve => setTimeout(resolve, 500)); // Add small delay
    }

    // Fetch from database
    const { data: dbData, error: dbError } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', wsId)
      .gte('start_at', startDate.toISOString())
      .lte('end_at', endDate.toISOString())
      .order('start_at', { ascending: true });

    if (dbError) {
      console.error(dbError);
      setError(dbError);
      return;
    }

    setData(dbData);

    if (progressCallback) {
      progressCallback({
        phase: 'fetch',
        percentage: 25,
        statusMessage: 'Fetching events from Google Calendar...',
        changesMade: false
      });
      await new Promise(resolve => setTimeout(resolve, 500)); // Add small delay
    }

    // Fetch from Google Calendar
    const response = await fetch(
      `/api/v1/calendar/auth/fetch?wsId=${wsId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
    );

    const googleResponse = await response.json();

    if (!response.ok) {
      const errorMessage = googleResponse.error + '. ' 
        + googleResponse.googleError + ': ' 
        + googleResponse.details?.reason;
      console.error(errorMessage);
      setError(new Error(errorMessage));
      return;
    }

    setGoogleData(googleResponse.events);

    if (progressCallback) {
      progressCallback({
        phase: 'upsert',
        percentage: 50,
        statusMessage: 'Syncing events to database...',
        changesMade: false
      });
      await new Promise(resolve => setTimeout(resolve, 500)); // Add small delay
    }

    // Upsert to database
    const eventsWithWsId = googleResponse.events.map((event: WorkspaceCalendarEvent) => ({
      ...event,
      ws_id: wsId
    }));

    const { data: upsertData, error: upsertError } = await supabase
      .from('workspace_calendar_events')
      .upsert(eventsWithWsId)
      .eq('ws_id', wsId)
      .select();

    if (upsertError) {
      console.error(upsertError);
      setError(upsertError);
      return;
    }

    setData(upsertData);

    if (progressCallback) {
      progressCallback({
        phase: 'complete',
        percentage: 100,
        statusMessage: 'Sync completed successfully',
        changesMade: true
      });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay at completion
    }
  };

  const syncToGoogle = async () => {};

  const value = {
    data,
    googleData,
    error,
    currentView,
    setCurrentView,
    syncToTuturuuu,
    syncToGoogle,
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
