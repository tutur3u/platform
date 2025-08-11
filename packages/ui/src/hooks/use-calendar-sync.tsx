'use client';

import { isAllDayEvent } from './calendar-utils';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Workspace,
  WorkspaceCalendarEvent,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { canProceedWithSync } from '@tuturuuu/utils/calendar-sync-coordination';
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
  useQuery: (options: {
    queryKey: string[];
    enabled: boolean;
    queryFn: () => Promise<WorkspaceCalendarEvent[] | null>;
    refetchInterval?: number;
  }) => {
    data: WorkspaceCalendarEvent[] | null;
    isLoading: boolean;
  };
  useQueryClient: () => {
    invalidateQueries: (options: {
      queryKey: string[];
      exact?: boolean;
    }) => Promise<void>;
  };
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
  const getCacheKey = useCallback((dateRange: Date[]) => {
    if (!dateRange || dateRange.length === 0) {
      return '';
    }
    const firstDate = dateRange[0];
    const lastDate = dateRange[dateRange.length - 1];
    if (!firstDate || !lastDate) {
      return '';
    }
    return `${firstDate.toISOString()}-${lastDate.toISOString()}`;
  }, []);

  // Helper to check if a date range includes today (current week issue)
  const includesCurrentWeek = useCallback((dateRange: Date[]) => {
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
  }, []);

  // Enhanced cache staleness check - shorter staleness for current week
  const CACHE_STALE_TIME_CURRENT_WEEK = 30 * 1000; // 30 seconds
  const CACHE_STALE_TIME_OTHER = 5 * 60 * 1000; // 5 minutes

  const isCacheStaleEnhanced = useCallback(
    (lastUpdated: number, dateRange: Date[]) => {
      const isCurrentWeek = includesCurrentWeek(dateRange);
      const staleTime = isCurrentWeek
        ? CACHE_STALE_TIME_CURRENT_WEEK
        : CACHE_STALE_TIME_OTHER;
      const isStale = Date.now() - lastUpdated >= staleTime;

      if (isCurrentWeek && isStale) {
        // Current week cache is stale, forcing fresh fetch
      }

      return isStale;
    },
    [includesCurrentWeek]
  );

  // Helper to update cache safely
  const updateCache = useCallback((cacheKey: string, update: CacheUpdate) => {
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
  }, []);

  // Fetch database events with caching
  const { data: fetchedData, isLoading: isDatabaseLoading } = useQuery({
    queryKey: ['databaseCalendarEvents', wsId, getCacheKey(dates)],
    enabled: !!wsId && dates.length > 0,
    queryFn: async () => {
      const cacheKey = getCacheKey(dates);
      if (!cacheKey) return null;

      const cachedData = calendarCache[cacheKey];

      // If we have cached data and it's not stale, return it immediately
      // BUT if we're forcing a refresh, always fetch fresh data
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

      // Update cache with new data
      updateCache(cacheKey, {
        dbEvents: fetchedData,
        dbLastUpdated: Date.now(),
      });

      // Reset the forced refresh flag only after we've successfully fetched fresh data
      if (isForcedRef.current) {
        isForcedRef.current = false;
      }

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
  const areDatesEqual = useCallback((newDates: Date[]) => {
    const newDatesStr = JSON.stringify(newDates.map((d) => d.toISOString()));
    const prevDatesStr = prevDatesRef.current;
    const areEqual = newDatesStr === prevDatesStr;
    if (!areEqual) {
      prevDatesRef.current = newDatesStr;
    }
    return areEqual;
  }, []);

  // Invalidate and refetch events
  const refresh = useCallback(() => {
    const cacheKey = getCacheKey(dates);
    if (!cacheKey) return null;

    isForcedRef.current = true;

    // Clear the cache for the current date range to ensure fresh data is fetched
    setCalendarCache((prev) => {
      const newCache = { ...prev };
      if (newCache[cacheKey]) {
        // Clear the cache for this specific date range
        newCache[cacheKey] = {
          ...newCache[cacheKey],
          dbEvents: [],
          dbLastUpdated: 0,
        };
      }
      return newCache;
    });

    // Invalidate all calendar-related queries to ensure updates are reflected
    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId, cacheKey],
    });

    // Also invalidate the general calendarEvents query used by other parts of the system
    queryClient.invalidateQueries({
      queryKey: ['calendarEvents', wsId],
    });

    // Invalidate Google Calendar events as well
    queryClient.invalidateQueries({
      queryKey: ['googleCalendarEvents', wsId, cacheKey],
    });
  }, [queryClient, wsId, dates, getCacheKey]);

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

        const startDate = dayjs(dates[0]).startOf('day');
        const endDate = dayjs(dates[dates.length - 1]).endOf('day');

        const activeSyncResponse = await fetch(
          `/api/v1/calendar/auth/active-sync`,
          {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({
              wsId,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            }),
          }
        );

        if (!activeSyncResponse.ok) {
          const errorData = await activeSyncResponse.json();
          setError(new Error(errorData.error));
          return;
        }

        const activeSyncData = await activeSyncResponse.json();
        const dbData = activeSyncData?.dbData;
        const googleData = activeSyncData?.googleData;

        if (dbData) {
          setData(dbData);
        }
        if (googleData) {
          setGoogleData(googleData);
        }

        setError(null);

        // Refresh the cache to trigger queryClient to refetch the data from database
        refresh();

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
    [wsId, dates, isActiveSyncOn, refresh]
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
  }, [fetchedGoogleData, syncToTuturuuu, experimentalGoogleToken?.ws_id, wsId]);

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
    areDatesEqual,
    updateCache,
    getCacheKey,
    includesCurrentWeek,
  ]);

  /*
  Show data from database to Tuturuuu
  */

  // Process events to remove duplicates, then memoize the result
  const events = useMemo(() => {
    // If we have fetched data, process it immediately
    if (fetchedData) {
      return fetchedData as CalendarEvent[];
    }
    // If we're still loading, return empty array
    return [];
  }, [fetchedData]);

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
  const lastProcessedData = useRef<WorkspaceCalendarEvent[] | null>(null);

  // Effect to initialize/reprocess data when fetchedData changes
  useEffect(() => {
    // Reset processed flag if data has actually changed
    if (fetchedData !== lastProcessedData.current) {
      hasProcessedInitialData.current = false;
      lastProcessedData.current = fetchedData;
    }

    if (fetchedData && !hasProcessedInitialData.current) {
      hasProcessedInitialData.current = true;
      // Force a re-render by updating the data state
      setData(fetchedData);
    }
  }, [fetchedData]);

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
