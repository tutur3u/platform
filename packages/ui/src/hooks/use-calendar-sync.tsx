'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceCalendarEvent } from '@tuturuuu/types/db';
import dayjs from 'dayjs';
import { createContext, useContext, useState } from 'react';

const CalendarSyncContext = createContext<{
  data: WorkspaceCalendarEvent[] | null;
  googleData: WorkspaceCalendarEvent[] | null;
  error: Error | null;
  dates: Date[];
  setDates: (dates: Date[]) => void;
  currentView: 'day' | '4-day' | 'week' | 'month';
  setCurrentView: (view: 'day' | '4-day' | 'week' | 'month') => void;
  syncToTuturuuu: (
    progressCallback?: (progress: {
      phase: 'get' | 'fetch' | 'upsert' | 'complete';
      percentage: number;
      statusMessage: string;
      changesMade: boolean;
    }) => void
  ) => Promise<void>;
  syncToGoogle: () => Promise<void>;
}>({
  data: null,
  googleData: null,
  error: null,
  dates: [],
  setDates: () => {},
  currentView: 'day',
  setCurrentView: () => {},
  syncToTuturuuu: async () => {},
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
  const [dates, setDates] = useState<Date[]>([]);
  const [currentView, setCurrentView] = useState<
    'day' | '4-day' | 'week' | 'month'
  >('day');

  const syncToTuturuuu = async (
    progressCallback?: (progress: {
      phase: 'get' | 'fetch' | 'upsert' | 'complete';
      percentage: number;
      statusMessage: string;
      changesMade: boolean;
    }) => void
  ) => {
    const supabase = createClient();

    if (!dates.length) {
      console.error('No dates available for sync');
      return;
    }
    console.log('dates', dates);

    // Use the exact range from dates array
    const startDate = dayjs(dates[0]).startOf('day');
    const endDate = dayjs(dates[dates.length - 1]).endOf('day');

    // Report get phase starting
    if (progressCallback) {
      progressCallback({
        phase: 'get',
        percentage: 0,
        statusMessage: 'Fetching events from database...',
        changesMade: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 500)); // Add small delay
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
        changesMade: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 500)); // Add small delay
    }

    // Fetch from Google Calendar
    const response = await fetch(
      `/api/v1/calendar/auth/fetch?wsId=${wsId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
    );

    const googleResponse = await response.json();

    if (!response.ok) {
      const errorMessage =
        googleResponse.error +
        '. ' +
        googleResponse.googleError +
        ': ' +
        googleResponse.details?.reason;
      console.error(errorMessage);
      setError(new Error(errorMessage));
      return;
    } else {
      setError(null);
    }

    setGoogleData(googleResponse.events);

    if (progressCallback) {
      progressCallback({
        phase: 'upsert',
        percentage: 50,
        statusMessage: 'Syncing events to database...',
        changesMade: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 500)); // Add small delay
    }

    // Insert id (uuid) if not present for Google events already in the database by comparing with data's events (same google_event_id and ws_id)
    const eventsWithWsId = googleResponse.events.map(
      (event: WorkspaceCalendarEvent) => {
        const existingEvent = data?.find(
          (e) => e.google_event_id === event.google_event_id && e.ws_id === wsId
        );
        console.log('existingEvent', existingEvent);
        if (existingEvent) {
          console.log('existingEvent.id', existingEvent.id);
          return {
            ...event,
            id: existingEvent.id,
            ws_id: wsId,
          };
        }
        return {
          ...event,
          id: crypto.randomUUID(),
          ws_id: wsId,
        };
      }
    );

    // Upsert to database
    const { data: upsertData, error: upsertError } = await supabase
      .from('workspace_calendar_events')
      .upsert(eventsWithWsId, {
        onConflict: 'id',
        ignoreDuplicates: false,
      })
      .select();

    if (upsertError) {
      console.error(upsertError);
      setError(upsertError);
      return;
    } else {
      setError(null);
    }

    setData(upsertData);

    if (progressCallback) {
      progressCallback({
        phase: 'complete',
        percentage: 100,
        statusMessage: 'Sync completed successfully',
        changesMade: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Longer delay at completion
    }
  };

  const syncToGoogle = async () => {};

  const value = {
    data,
    googleData,
    error,
    dates,
    setDates,
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
