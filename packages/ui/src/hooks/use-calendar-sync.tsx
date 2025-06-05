'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Workspace,
  WorkspaceCalendarEvent,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  // Events-related operations
  events: CalendarEvent[];

  // Show data from database to Tuturuuu
  eventsWithoutAllDays: CalendarEvent[];
  allDayEvents: CalendarEvent[];

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

  // Events-related operations
  events: [],

  // Show data from database to Tuturuuu
  eventsWithoutAllDays: [],
  allDayEvents: [],

  syncToGoogle: async () => {},
});

// Add a type for the cache
type CalendarCache = {
  [key: string]: {
    dbEvents: WorkspaceCalendarEvent[];
    googleEvents: WorkspaceCalendarEvent[];
    lastUpdated: number;
  };
};

// Helper type for cache updates
type CacheUpdate = {
  dbEvents?: WorkspaceCalendarEvent[];
  googleEvents?: WorkspaceCalendarEvent[];
  lastUpdated: number;
};

export const CalendarSyncProvider = ({
  children,
  wsId,
  experimentalGoogleToken,
  useQuery,
  useQueryClient,
}: {
  children: React.ReactNode;
  wsId: Workspace['id'];
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  useQuery: any;
  useQueryClient: any;
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
  const [calendarCache, setCalendarCache] = useState<CalendarCache>({});
  const prevGoogleDataRef = useRef<string>('');
  const prevDatesRef = useRef<string>('');
  const queryClient = useQueryClient();

  // Helper to generate cache key from dates
  const getCacheKey = (dateRange: Date[]) => {
    if (!dateRange || dateRange.length === 0) {
      return '';
    }
    return `${dateRange[0]!.toISOString()}-${dateRange[dateRange.length - 1]!.toISOString()}`;
  };

  // Helper to check if cache is stale (older than 5 minutes)
  const isCacheStale = (lastUpdated: number) => {
    return Date.now() - lastUpdated > 5 * 60 * 1000;
  };

  // Helper to update cache safely
  const updateCache = (cacheKey: string, update: CacheUpdate) => {
    setCalendarCache((prev) => {
      const existing = prev[cacheKey] || {
        dbEvents: [],
        googleEvents: [],
        lastUpdated: 0,
      };

      return {
        ...prev,
        [cacheKey]: {
          dbEvents: update.dbEvents || existing.dbEvents,
          googleEvents: update.googleEvents || existing.googleEvents,
          lastUpdated: update.lastUpdated,
        },
      };
    });
  };

  // Fetch database events with caching
  const { data: fetchedData } = useQuery({
    queryKey: ['databaseCalendarEvents', wsId, getCacheKey(dates)],
    enabled: !!wsId && dates.length > 0,
    queryFn: async () => {
      const cacheKey = getCacheKey(dates);
      if (!cacheKey) return null;

      const cachedData = calendarCache[cacheKey];

      // If we have cached data and it's not stale, return it immediately
      if (cachedData?.dbEvents && !isCacheStale(cachedData.lastUpdated)) {
        setData(cachedData.dbEvents);
        return cachedData.dbEvents;
      }

      // Otherwise fetch fresh data
      const supabase = createClient();
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1]).endOf('day');

      const { data: fetchedData, error: dbError } = await supabase
        .from('workspace_calendar_events')
        .select('*')
        .eq('ws_id', wsId)
        .gte('start_at', startDate.toISOString())
        .lte('end_at', endDate.toISOString())
        .order('start_at', { ascending: true });

      if (dbError) {
        console.error(dbError);
        setError(dbError);
        return null;
      }

      // Update cache with new data
      updateCache(cacheKey, {
        dbEvents: fetchedData,
        lastUpdated: Date.now(),
      });

      setData(fetchedData);
      return fetchedData;
    },
    refetchInterval: 30000,
  });

  // Fetch google events with caching
  const { data: fetchedGoogleData } = useQuery({
    queryKey: ['googleCalendarEvents', wsId, getCacheKey(dates)],
    enabled:
      !!wsId && experimentalGoogleToken?.ws_id === wsId && dates.length > 0,
    queryFn: async () => {
      const cacheKey = getCacheKey(dates);
      if (!cacheKey) return null;

      const cachedData = calendarCache[cacheKey];

      // If we have cached data and it's not stale, return it immediately
      if (cachedData?.googleEvents && !isCacheStale(cachedData.lastUpdated)) {
        setGoogleData(cachedData.googleEvents);
        return cachedData.googleEvents;
      }

      // Otherwise fetch fresh data
      console.log('Fetching fresh google events');
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1]).endOf('day');

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
        return null;
      }

      // Update cache with new data
      updateCache(cacheKey, {
        googleEvents: googleResponse.events,
        lastUpdated: Date.now(),
      });

      setGoogleData(googleResponse.events);
      setError(null);
      return googleResponse.events;
    },
    refetchInterval: 30000,
  });

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

      // After successful sync, update the cache
      if (upsertData) {
        const cacheKey = getCacheKey(dates);
        updateCache(cacheKey, {
          dbEvents: upsertData,
          lastUpdated: Date.now(),
        });
      }
    },
    [wsId, dates]
  );

  // Sync to Tuturuuu database when google data changes for current view
  useEffect(() => {
    // If have not connected to google, don't sync
    if (experimentalGoogleToken?.ws_id !== wsId) {
      return;
    }

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
    // If have not connected to google, don't sync
    if (experimentalGoogleToken?.ws_id !== wsId) {
      return;
    }
    // Skip if dates haven't actually changed
    if (areDatesEqual(dates)) {
      return;
    }

    // Trigger a refetch of both database and google events
    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId, getCacheKey(dates)],
    });
    queryClient.invalidateQueries({
      queryKey: ['googleCalendarEvents', wsId, getCacheKey(dates)],
    });
  }, [dates, queryClient, wsId, experimentalGoogleToken?.ws_id]);

  /*
  Show data from database to Tuturuuu
  */

  // Create a unique signature for an event based on its content
  const createEventSignature = (event: CalendarEvent): string => {
    return `${event.title}|${event.description || ''}|${event.start_at}|${event.end_at}`;
  };

  // Detect and remove duplicate events
  const removeDuplicateEvents = useCallback(
    async (eventsData: CalendarEvent[]) => {
      if (!wsId || !eventsData || eventsData.length === 0) return eventsData;

      // Group events by their signature
      const eventGroups = new Map<string, CalendarEvent[]>();

      eventsData.forEach((event) => {
        const signature = createEventSignature(event);
        if (!eventGroups.has(signature)) {
          eventGroups.set(signature, []);
        }
        eventGroups.get(signature)!.push(event);
      });

      // Find duplicates that need to be removed
      const eventsToDelete: string[] = [];
      let deletionPerformed = false;

      eventGroups.forEach((eventGroup, signature) => {
        if (eventGroup.length > 1) {
          console.log(
            `Found ${eventGroup.length} duplicates with signature "${signature}"`
          );

          // Sort by creation time if available, otherwise by ID
          // Keep the first/oldest event, delete the rest
          const sortedEvents = [...eventGroup].sort((a, b) => {
            // If we have created_at field, use it (check with optional chaining)
            const aCreatedAt = (a as any)?.created_at;
            const bCreatedAt = (b as any)?.created_at;
            if (aCreatedAt && bCreatedAt) {
              return (
                new Date(aCreatedAt).getTime() - new Date(bCreatedAt).getTime()
              );
            }
            // Otherwise sort by ID which is often sequential
            return a.id.localeCompare(b.id);
          });

          // Keep the first event (oldest), mark the rest for deletion
          const eventsToRemove = sortedEvents.slice(1);
          eventsToRemove.forEach((event) => {
            eventsToDelete.push(event.id);
          });
        }
      });

      // Delete duplicate events if any were found
      if (eventsToDelete.length > 0) {
        try {
          const supabase = createClient();
          // Delete in batches of 10 to avoid request size limitations
          const batchSize = 10;
          for (let i = 0; i < eventsToDelete.length; i += batchSize) {
            const batch = eventsToDelete.slice(i, i + batchSize);
            const { error } = await supabase
              .from('workspace_calendar_events')
              .delete()
              .in('id', batch);

            if (error) {
              console.error('Error deleting duplicate events:', error);
            } else {
              deletionPerformed = true;
              console.log(
                `Successfully deleted ${batch.length} duplicate events`
              );
            }
          }

          // If events were deleted, refresh to get updated data
          if (deletionPerformed) {
            queryClient.invalidateQueries({
              queryKey: ['calendarEvents', wsId],
            });
          }
        } catch (err) {
          console.error('Failed to delete duplicate events:', err);
        }
      }

      // Return the filtered list without duplicates
      return eventsData.filter((event) => !eventsToDelete.includes(event.id));
    },
    [wsId, queryClient]
  );

  // Process events to remove duplicates, then memoize the result
  const events = useMemo(() => {
    return (fetchedData ?? []) as CalendarEvent[];
  }, [fetchedData, removeDuplicateEvents]);

  const eventsWithoutAllDays = useMemo(() => {
    return events.filter((event) => {
      const start = dayjs(event.start_at);
      const end = dayjs(event.end_at);

      const duration = Math.abs(end.diff(start, 'seconds'));
      return duration % (24 * 60 * 60) !== 0;
    });
  }, [events]);

  const allDayEvents = useMemo(() => {
    return events.filter((event) => {
      const start = dayjs(event.start_at);
      const end = dayjs(event.end_at);

      const duration = Math.abs(end.diff(start, 'seconds'));
      return duration % (24 * 60 * 60) === 0;
    });
  }, [events]);

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

    // Events-related operations
    events,

    // Show data from database to Tuturuuu
    eventsWithoutAllDays,
    allDayEvents,
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
