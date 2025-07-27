'use client';

import { isAllDayEvent } from './calendar-utils';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Workspace,
  WorkspaceCalendarEvent,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import {
  canProceedWithSync,
  updateLastUpsert,
} from '@tuturuuu/utils/calendar-sync-coordination';
import { DEV_MODE } from '@tuturuuu/utils/constants';
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
  // eslint-disable-next-line no-unused-vars
  setDates: (dates: Date[]) => void;
  currentView: 'day' | '4-day' | 'week' | 'month';
  // eslint-disable-next-line no-unused-vars
  setCurrentView: (view: 'day' | '4-day' | 'week' | 'month') => void;
  syncToTuturuuu: (
    // eslint-disable-next-line no-unused-vars
    progressCallback?: (progress: {
      phase: 'get' | 'fetch' | 'delete' | 'upsert' | 'complete';
      percentage: number;
      statusMessage: string;
      changesMade: boolean;
    }) => void
  ) => Promise<void>;

  isActiveSyncOn: boolean;

  // Events-related operations
  events: CalendarEvent[];
  setIsActiveSyncOn: (isActive: boolean) => void;
  // Show data from database to Tuturuuu
  eventsWithoutAllDays: CalendarEvent[];
  allDayEvents: CalendarEvent[];
  refresh: () => void;

  syncToGoogle: () => Promise<void>;

  // Loading states
  isLoading: boolean;
  isSyncing: boolean;
}>({
  data: null,
  googleData: null,
  error: null,
  dates: [],
  setDates: () => {},
  currentView: 'day',
  setCurrentView: () => {},
  syncToTuturuuu: async () => {},
  isActiveSyncOn: false,
  setIsActiveSyncOn: () => {},
  // Events-related operations
  events: [],

  // Show data from database to Tuturuuu
  eventsWithoutAllDays: [],
  allDayEvents: [],
  refresh: () => {},

  // Sync to Google
  syncToGoogle: async () => {},

  // Loading states
  isLoading: false,
  isSyncing: false,
});

// Add a type for the cache
type CalendarCache = {
  [key: string]: {
    dbEvents: WorkspaceCalendarEvent[];
    googleEvents: WorkspaceCalendarEvent[];
    dbLastUpdated: number;
    googleLastUpdated: number;
  };
};

// Helper type for cache updates
type CacheUpdate = {
  dbEvents?: WorkspaceCalendarEvent[];
  googleEvents?: WorkspaceCalendarEvent[];
  dbLastUpdated?: number;
  googleLastUpdated?: number;
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
  const [isActiveSyncOn, setIsActiveSyncOn] = useState(true);
  const [calendarCache, setCalendarCache] = useState<CalendarCache>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const prevGoogleDataRef = useRef<string>('');
  const prevDatesRef = useRef<string>('');
  const isForcedRef = useRef<boolean>(false);
  const queryClient = useQueryClient();

  // Helper to generate cache key from dates
  const getCacheKey = (dateRange: Date[]) => {
    if (!dateRange || dateRange.length === 0) {
      return '';
    }
    return `${dateRange[0]!.toISOString()}-${dateRange[dateRange.length - 1]!.toISOString()}`;
  };

  // Helper to check if a date range includes today (current week issue)
  const includesCurrentWeek = (dateRange: Date[]) => {
    if (!dateRange || dateRange.length === 0) return false;
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59
    );

    const firstDate = dateRange[0];
    const lastDate = dateRange[dateRange.length - 1];
    if (!firstDate || !lastDate) return false;

    const rangeStart = new Date(firstDate);
    const rangeEnd = new Date(lastDate);

    return rangeStart <= endOfToday && rangeEnd >= startOfToday;
  };

  // Enhanced cache staleness check - shorter staleness for current week
  const isCacheStaleEnhanced = (lastUpdated: number, dateRange: Date[]) => {
    const isCurrentWeek = includesCurrentWeek(dateRange);
    // 30 seconds for current week, 5 minutes for other weeks
    const staleTime = isCurrentWeek ? 30 * 1000 : 5 * 60 * 1000; // 30 seconds
    const isStale = Date.now() - lastUpdated >= staleTime;

    if (isCurrentWeek && isStale) {
      // Current week cache is stale, forcing fresh fetch
    }

    return isStale;
  };

  // Helper to update cache safely
  const updateCache = (cacheKey: string, update: CacheUpdate) => {
    setCalendarCache((prev) => {
      const existing = prev[cacheKey] || {
        dbEvents: [],
        googleEvents: [],
        dbLastUpdated: 0,
        googleLastUpdated: 0,
      };

      return {
        ...prev,
        [cacheKey]: {
          dbEvents:
            update.dbEvents !== undefined ? update.dbEvents : existing.dbEvents,
          googleEvents:
            update.googleEvents !== undefined
              ? update.googleEvents
              : existing.googleEvents,
          dbLastUpdated:
            update.dbLastUpdated !== undefined
              ? update.dbLastUpdated
              : existing.dbLastUpdated,
          googleLastUpdated:
            update.googleLastUpdated !== undefined
              ? update.googleLastUpdated
              : existing.googleLastUpdated,
        },
      };
    });
  };

  // Fetch database events with caching
  const { data: fetchedData, isLoading: isDatabaseLoading } = useQuery({
    queryKey: ['databaseCalendarEvents', wsId, getCacheKey(dates)],
    enabled: !!wsId && dates.length > 0,
    queryFn: async () => {
      const cacheKey = getCacheKey(dates);
      if (!cacheKey) return null;

      const cachedData = calendarCache[cacheKey];

      // If we have cached data and it's not stale, return it immediately
      if (
        cachedData?.dbEvents &&
        cachedData.dbEvents.length > 0 &&
        !isCacheStaleEnhanced(cachedData.dbLastUpdated, dates) &&
        !isForcedRef.current
      ) {
        setData(cachedData.dbEvents);
        return cachedData.dbEvents;
      }

      // Otherwise fetch fresh data
      const supabase = createClient();
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1]).endOf('day');

      // Fix: Use correct overlap condition for multi-day events
      // Event overlaps with visible range if: event_start < visible_end AND event_end > visible_start
      const { data: fetchedData, error: dbError } = await supabase
        .from('workspace_calendar_events')
        .select('*')
        .eq('ws_id', wsId)
        .lt('start_at', endDate.add(1, 'day').toISOString()) // Event starts before visible range ends
        .gt('end_at', startDate.toISOString()) // Event ends after visible range starts
        .order('start_at', { ascending: true });

      if (dbError) {
        setError(dbError);
        return null;
      }

      // Update cache with new data and reset isForced flag
      updateCache(cacheKey, {
        dbEvents: fetchedData,
        dbLastUpdated: Date.now(),
      });

      // Reset the ref immediately (synchronous)
      isForcedRef.current = false;

      setData(fetchedData);
      return fetchedData;
    },
    refetchInterval: 30000,
  });

  // Fetch google events with caching
  const { data: fetchedGoogleData, isLoading: isGoogleLoading } = useQuery({
    queryKey: ['googleCalendarEvents', wsId, getCacheKey(dates)],
    enabled:
      !!wsId && experimentalGoogleToken?.ws_id === wsId && dates.length > 0,
    queryFn: async () => {
      const cacheKey = getCacheKey(dates);
      if (!cacheKey) return null;

      const cachedData = calendarCache[cacheKey];

      // If we have cached data and it's not stale, return it immediately
      if (
        cachedData?.googleEvents &&
        cachedData.googleEvents.length > 0 &&
        !isCacheStaleEnhanced(cachedData.googleLastUpdated, dates)
      ) {
        setGoogleData(cachedData.googleEvents);
        return cachedData.googleEvents;
      }

      // Otherwise fetch fresh data
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
        setError(new Error(errorMessage));
        return null;
      }

      // Update cache with new data
      updateCache(cacheKey, {
        googleEvents: googleResponse.events,
        googleLastUpdated: Date.now(),
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
      // eslint-disable-next-line no-unused-vars
      progressCallback?: (progress: {
        phase: 'get' | 'fetch' | 'delete' | 'upsert' | 'complete';
        percentage: number;
        statusMessage: string;
        changesMade: boolean;
      }) => void
    ) => {
      if (!isActiveSyncOn) {
        return;
      }

      setIsSyncing(true);
      try {
        // Check if we can proceed with sync
        const canProceed = await canProceedWithSync(wsId);
        if (!canProceed) {
          return;
        }

        const supabase = createClient();

        // get the current user
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          setError(new Error('User not authenticated'));
          return;
        }

        // Log the start of the sync
        let syncRecord: {
          end_time: string | null;
          deleted_events: number | null;
          inserted_events: number | null;
          updated_events: number | null;
          id: string;
          source: string | null;
          start_time: string | null;
          status: string | null;
          type: string | null;
          triggered_by: string | null;
          ws_id: string;
        } | null = null;
        let numInserted = 0;
        let numUpdated = 0;
        let numDeleted = 0;

        if (DEV_MODE) {
          const { data: syncRecordData, error: insertError } = await supabase
            .from('calendar_sync_dashboard')
            .insert({
              ws_id: wsId,
              start_time: new Date().toISOString(),
              end_time: new Date().toISOString(),
              triggered_by: authUser?.id,
              type: 'active',
              status: 'running',
              inserted_events: 0,
              updated_events: 0,
              deleted_events: 0,
            })
            .select()
            .single();

          if (insertError) {
            setError(insertError);
            return;
          }

          syncRecord = syncRecordData;
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
          .lt('start_at', endDate.add(1, 'day').toISOString()) // Event starts before visible range ends
          .gt('end_at', startDate.toISOString()) // Event ends after visible range starts
          .order('start_at', { ascending: true });

        if (dbError) {
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
          setError(new Error(errorMessage));
          return;
        } else {
          setError(null);
        }

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
          (e: WorkspaceCalendarEvent) =>
            e.google_event_id && !googleEventIds.has(e.google_event_id)
        );
        // Delete dataToDelete
        if (dataToDelete) {
          const { error: deleteError } = await supabase
            .from('workspace_calendar_events')
            .delete()
            .in(
              'id',
              dataToDelete.map((e) => e.id)
            );

          if (deleteError) {
            setError(deleteError);
            return;
          } else {
            setError(null);
            numDeleted = dataToDelete.length;
          }
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
            // Find existing event with same google_event_id
            const existingEvent = dbData?.find((e) => {
              const matches =
                e.google_event_id === event.google_event_id &&
                e.google_event_id !== null;
              return matches;
            });

            if (existingEvent) {
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

        const { data: upsertData, error: upsertError } = await supabase.rpc(
          'upsert_calendar_events_and_count',
          {
            events: eventsToUpsert,
          }
        );

        if (upsertError) {
          setError(upsertError);
          return;
        }
        setError(null);
        // Update lastUpsert timestamp after successful upsert
        await updateLastUpsert(wsId);

        // Refresh the cache to trigger queryClient to refetch the data from database
        refresh();

        if (DEV_MODE && syncRecord) {
          // Type assertion since we know the function returns { inserted: number, updated: number }
          const result = upsertData as { inserted: number; updated: number };
          numInserted = result?.inserted || 0;
          numUpdated = result?.updated || 0;

          // Update the sync dashboard
          await supabase
            .from('calendar_sync_dashboard')
            .update({
              status: 'completed',
              end_time: new Date().toISOString(),
              inserted_events: numInserted,
              updated_events: numUpdated,
              deleted_events: numDeleted,
            })
            .eq('id', syncRecord.id);
        }

        if (progressCallback) {
          progressCallback({
            phase: 'complete',
            percentage: 100,
            statusMessage: 'Sync completed successfully',
            changesMade: true,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Longer delay at completion
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [wsId, dates, queryClient, isActiveSyncOn]
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
      syncToTuturuuu();
      // Update refs with current values
      prevGoogleDataRef.current = currentGoogleDataStr;
    }
  }, [fetchedGoogleData, syncToTuturuuu]);

  // Trigger sync when isActiveSyncOn becomes true
  useEffect(() => {
    // If have not connected to google, don't sync
    if (experimentalGoogleToken?.ws_id !== wsId) {
      return;
    }

    // Only sync when isActiveSyncOn becomes true and we have Google data
    if (isActiveSyncOn && fetchedGoogleData && fetchedGoogleData.length > 0) {
      syncToTuturuuu();
    }
  }, [
    isActiveSyncOn,
    fetchedGoogleData,
    syncToTuturuuu,
    wsId,
    experimentalGoogleToken?.ws_id,
  ]);

  // Trigger refetch from DB and Google when changing views AND there are changes in Google data
  // This will trigger syncToTuturuuu()
  useEffect(() => {
    // If have not connected to google, don't sync
    if (experimentalGoogleToken?.ws_id !== wsId) {
      return;
    }
    // Skip if dates haven't actually changed
    if (areDatesEqual(dates)) {
      return;
    }

    const cacheKey = getCacheKey(dates);
    const cacheData = calendarCache[cacheKey];

    // For current week, always force a fresh fetch to ensure sync is up to date
    const isCurrentWeek = includesCurrentWeek(dates);

    if (cacheData) {
      isForcedRef.current = true;
      // For current week, also reset the cache timestamp to force refresh
      if (isCurrentWeek) {
        updateCache(cacheKey, {
          dbLastUpdated: 0,
          googleLastUpdated: 0,
        });
      }
    }

    // Trigger a refetch of both database and google events
    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId, getCacheKey(dates)],
    });
    queryClient.invalidateQueries({
      queryKey: ['googleCalendarEvents', wsId, getCacheKey(dates)],
    });
  }, [
    dates,
    queryClient,
    wsId,
    experimentalGoogleToken?.ws_id,
    calendarCache,
    includesCurrentWeek,
  ]);

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

      eventGroups.forEach((eventGroup) => {
        if (eventGroup.length > 1) {
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
              // Error deleting duplicate events
            } else {
              deletionPerformed = true;
            }
          }

          // If events were deleted, refresh to get updated data
          if (deletionPerformed) {
            queryClient.invalidateQueries({
              queryKey: ['databaseCalendarEvents', wsId],
              exact: false,
            });
          }
        } catch (err) {
          // Failed to delete duplicate events
        }
      }

      // Return the filtered list without duplicates
      return eventsData.filter((event) => !eventsToDelete.includes(event.id));
    },
    [wsId, queryClient]
  );

  // Process events to remove duplicates, then memoize the result
  const events = useMemo(() => {
    // If we have fetched data, process it immediately
    if (fetchedData) {
      return fetchedData as CalendarEvent[];
    }
    // If we're still loading, return empty array
    return [];
  }, [fetchedData, removeDuplicateEvents]);

  // Invalidate and refetch events
  const refresh = useCallback(() => {
    const cacheKey = getCacheKey(dates);
    if (!cacheKey) return null;

    isForcedRef.current = true;

    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId, getCacheKey(dates)],
    });
  }, [queryClient, wsId, dates]);

  const eventsWithoutAllDays = useMemo(() => {
    // Process events immediately when they change
    return events.filter((event) => {
      // Note: We can't access settings here easily, so we use default timezone detection
      // This is acceptable since this is used for layout purposes mainly
      return !isAllDayEvent(event);
    });
  }, [events]);

  const allDayEvents = useMemo(() => {
    // Process events immediately when they change
    return events.filter((event) => {
      // Note: We can't access settings here easily, so we use default timezone detection
      // This is acceptable since this is used for layout purposes mainly
      return isAllDayEvent(event);
    });
  }, [events]);

  // Add a ref to track if we've processed the initial data
  const hasProcessedInitialData = useRef(false);

  // Effect to process initial data
  useEffect(() => {
    if (fetchedData && !hasProcessedInitialData.current) {
      hasProcessedInitialData.current = true;
      // Force a re-render by updating the data state
      setData(fetchedData);
    }
  }, [fetchedData]);

  // Effect to reset the processed flag when dates change
  useEffect(() => {
    hasProcessedInitialData.current = false;
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
    isActiveSyncOn,
    setIsActiveSyncOn,
    // Events-related operations
    events,

    // Show data from database to Tuturuuu
    eventsWithoutAllDays,
    allDayEvents,
    refresh,

    // Loading states
    isLoading: isDatabaseLoading || isGoogleLoading,
    isSyncing,
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
