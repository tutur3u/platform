'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Workspace,
  WorkspaceCalendarEvent,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import dayjs from 'dayjs';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

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
      phase: 'get' | 'fetch' | 'delete' | 'upsert' | 'complete';
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
  experimentalGoogleToken,
  useQuery,
}: {
  children: React.ReactNode;
  wsId: Workspace['id'];
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken;
  useQuery: any;
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
  const prevGoogleDataRef = useRef<string>('');
  const prevDatesRef = useRef<string>('');

  // Fetch google events every 30 seconds
  const { data: fetchedGoogleData } = useQuery({
    queryKey: ['googleCalendarEvents', wsId],
    enabled: !!wsId && experimentalGoogleToken?.ws_id === wsId,
    queryFn: () => fetchGoogleCalendarEvents(),
    refetchInterval: 30000,
  });

  const fetchGoogleCalendarEvents = async () => {
    console.log('30 SECONDS fetch google events');
    let startDate = dayjs(dates[0]).startOf('day');
    let endDate = dayjs(dates[dates.length - 1]).endOf('day');
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
    return googleResponse.events;
  };

  // Helper to check if dates have actually changed
  const areDatesEqual = (newDates: Date[]) => {
    const newDatesStr = JSON.stringify(newDates.map((d) => d.toISOString()));
    const prevDatesStr = prevDatesRef.current;
    const areEqual = newDatesStr === prevDatesStr;
    if (!areEqual) {
      prevDatesRef.current = newDatesStr;
    }
    return areEqual;
  };

  // Sync Google events of current view to Tuturuuu database
  const syncToTuturuuu = useCallback(
    async (
      progressCallback?: (progress: {
        phase: 'get' | 'fetch' | 'delete' | 'upsert' | 'complete';
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

      // Debug log for database data
      console.log(
        'Database events:',
        dbData?.map((e: WorkspaceCalendarEvent) => ({
          id: e.id,
          title: e.title,
          google_event_id: e.google_event_id,
          ws_id: e.ws_id,
        }))
      );

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

      // Debug log for Google events
      console.log(
        'Google Calendar events:',
        googleResponse.events?.map((e: WorkspaceCalendarEvent) => ({
          title: e.title,
          google_event_id: e.google_event_id,
          start_at: e.start_at,
          end_at: e.end_at,
        }))
      );

      setGoogleData(googleResponse.events);

      if (progressCallback) {
        progressCallback({
          phase: 'delete',
          percentage: 50,
          statusMessage: 'Deleting events from database...',
          changesMade: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 500)); // Add small delay
      }

      // Create a set of google_event_id from googleResponse.events
      const googleEventIds = new Set(
        googleResponse.events.map(
          (e: WorkspaceCalendarEvent) => e.google_event_id
        )
      );

      // Filter data not in googleEventIds
      const dataToDelete = dbData?.filter(
        (e: WorkspaceCalendarEvent) => !googleEventIds.has(e.google_event_id)
      );
      console.log('dataToDelete', dataToDelete);
      // Delete dataToDelete
      if (dataToDelete) {
        await supabase
          .from('workspace_calendar_events')
          .delete()
          .in(
            'id',
            dataToDelete.map((e) => e.id)
          );
      }

      if (progressCallback) {
        progressCallback({
          phase: 'upsert',
          percentage: 75,
          statusMessage: 'Syncing events to database...',
          changesMade: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 500)); // Add small delay
      }

      // Prepare events for upsert by matching with existing events
      const eventsToUpsert = googleResponse.events.map(
        (event: WorkspaceCalendarEvent) => {
          // Only try to match if we have google_event_id
          if (!event.google_event_id) {
            console.log('Event has no google_event_id:', event.title);
            return {
              ...event,
              id: crypto.randomUUID(),
              ws_id: wsId,
            };
          }

          // Debug log for each comparison attempt
          console.log('Trying to match event:', {
            title: event.title,
            google_event_id: event.google_event_id,
            start_at: event.start_at,
            end_at: event.end_at,
          });

          // Find existing event with same google_event_id
          const existingEvent = dbData?.find((e) => {
            const matches =
              e.google_event_id === event.google_event_id &&
              e.google_event_id !== null;
            if (matches) {
              console.log('Found match:', {
                dbEvent: {
                  id: e.id,
                  title: e.title,
                  google_event_id: e.google_event_id,
                  ws_id: e.ws_id,
                },
                googleEvent: {
                  title: event.title,
                  google_event_id: event.google_event_id,
                },
              });
            }
            return matches;
          });

          if (existingEvent) {
            console.log('Using existing event ID:', {
              title: event.title,
              existingId: existingEvent.id,
              google_event_id: event.google_event_id,
            });
            return {
              ...event,
              id: existingEvent.id,
              ws_id: wsId,
            };
          }

          console.log('No match found, generating new ID for:', event.title);
          return {
            ...event,
            id: crypto.randomUUID(),
            ws_id: wsId,
          };
        }
      );

      // Debug log for final upsert data
      console.log(
        'Events to upsert:',
        eventsToUpsert.map((e: WorkspaceCalendarEvent) => ({
          id: e.id,
          title: e.title,
          google_event_id: e.google_event_id,
          ws_id: e.ws_id,
        }))
      );

      // Upsert using id as conflict target since we've properly assigned ids
      const { data: upsertData, error: upsertError } = await supabase
        .from('workspace_calendar_events')
        .upsert(eventsToUpsert, {
          onConflict: 'id',
          ignoreDuplicates: false,
        })
        .select();

      if (upsertError) {
        console.error('Error upserting events:', upsertError);
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
    },
    [wsId, dates]
  );

  // Sync to Tuturuuu database when google data changes for current view
  useEffect(() => {
    // Convert current data to strings for comparison
    const currentGoogleDataStr = JSON.stringify(fetchedGoogleData);

    // Only sync if the data has actually changed
    const hasDataChanged = currentGoogleDataStr !== prevGoogleDataRef.current;

    if (hasDataChanged) {
      console.log('useEffect 1');
      syncToTuturuuu();
      // Update refs with current values
      prevGoogleDataRef.current = currentGoogleDataStr;
    }
  }, [fetchedGoogleData, syncToTuturuuu]);

  // Sync to Tuturuuu database when changing views AND there are changes in Google data
  useEffect(() => {
    // Skip if dates haven't actually changed
    if (areDatesEqual(dates)) {
      return;
    }

    const syncData = async () => {
      const ggData = await fetchGoogleCalendarEvents();
      if (ggData) {
        const currentGoogleDataStr = JSON.stringify(ggData);

        // Only sync if the data has changed for this view
        console.log('useEffect 2');
        syncToTuturuuu();
        prevGoogleDataRef.current = currentGoogleDataStr;
      }
    };
    syncData();
  }, [dates]);

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
