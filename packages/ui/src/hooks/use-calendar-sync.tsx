'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { canProceedWithSync } from '@tuturuuu/trigger/calendar-sync-coordination';
import type {
  Workspace,
  WorkspaceCalendarEvent,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
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
import { toast } from '../components/ui/sonner';

// Type for calendar connection
type CalendarConnection = {
  id: string;
  ws_id: string;
  calendar_id: string;
  calendar_name: string;
  is_enabled: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
};

// Extended CalendarEvent type with habit flags
export type CalendarEventWithHabitInfo = CalendarEvent & {
  _isHabit?: boolean;
  _habitCompleted?: boolean;
};

// Sync status type
type SyncStatus = {
  state: 'idle' | 'syncing' | 'success' | 'error';
  message?: string;
  lastSyncTime?: Date;
  direction?: 'google-to-tuturuuu' | 'tuturuuu-to-google' | 'both';
};

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
  events: CalendarEventWithHabitInfo[];
  setIsActiveSyncOn: (isActive: boolean) => void;
  // Show data from database to Tuturuuu
  eventsWithoutAllDays: CalendarEvent[];
  allDayEvents: CalendarEvent[];
  refresh: () => void;

  syncToGoogle: () => Promise<void>;

  // Calendar connections and filtering
  calendarConnections: CalendarConnection[];
  enabledCalendarIds: Set<string>;
  updateCalendarConnection: (connectionId: string, isEnabled: boolean) => void;
  setCalendarConnections: (connections: CalendarConnection[]) => void;

  // Sync status
  syncStatus: SyncStatus;

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

  // Calendar connections and filtering
  calendarConnections: [],
  enabledCalendarIds: new Set(),
  updateCalendarConnection: () => {},
  setCalendarConnections: () => {},

  // Sync status
  syncStatus: { state: 'idle' },

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
  initialCalendarConnections = [],
}: {
  children: React.ReactNode;
  wsId: Workspace['id'];
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  initialCalendarConnections?: CalendarConnection[];
}) => {
  const [data, setData] = useState<WorkspaceCalendarEvent[] | null>(null);
  const [googleData, setGoogleData] = useState<WorkspaceCalendarEvent[] | null>(
    null
  );
  const [events, setEvents] = useState<CalendarEventWithHabitInfo[]>([]);

  const [error, setError] = useState<Error | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [currentView, setCurrentView] = useState<
    'day' | '4-day' | 'week' | 'month'
  >('day');
  const [isActiveSyncOn, setIsActiveSyncOn] = useState(true);
  const [calendarCache, setCalendarCache] = useState<CalendarCache>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });
  const prevGoogleDataRef = useRef<string>('');
  const prevDatesRef = useRef<string>('');
  const isForcedRef = useRef<boolean>(false);
  const lastSyncTimeRef = useRef<number>(0);
  const syncDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  // Calendar connections state
  const [calendarConnections, setCalendarConnectionsState] = useState<
    CalendarConnection[]
  >(initialCalendarConnections);

  // Compute enabled calendar IDs
  const enabledCalendarIds = useMemo(() => {
    return new Set(
      calendarConnections
        .filter((conn) => conn.is_enabled)
        .map((conn) => conn.calendar_id)
    );
  }, [calendarConnections]);

  // Update calendar connection state
  const updateCalendarConnection = useCallback(
    (connectionId: string, isEnabled: boolean) => {
      setCalendarConnectionsState((prev) =>
        prev.map((conn) =>
          conn.id === connectionId ? { ...conn, is_enabled: isEnabled } : conn
        )
      );
    },
    []
  );

  const setCalendarConnections = useCallback(
    (connections: CalendarConnection[]) => {
      setCalendarConnectionsState(connections);
    },
    []
  );

  // Helper to generate cache key from dates
  const getCacheKey = useCallback((dateRange: Date[]) => {
    if (!dateRange || dateRange.length === 0) {
      return '';
    }
    return `${dateRange[0]!.toISOString()}-${dateRange[dateRange.length - 1]!.toISOString()}`;
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
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
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

      // Otherwise fetch fresh data via API (which handles E2EE decryption)
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1]).endOf('day');

      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/calendar/events?start_at=${startDate.toISOString()}&end_at=${endDate.add(1, 'day').toISOString()}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch events');
        }

        const result = await response.json();
        const fetchedData = result.data || [];

        // Update cache with new data and reset isForced flag
        updateCache(cacheKey, {
          dbEvents: fetchedData,
          dbLastUpdated: Date.now(),
        });

        // Reset the ref immediately (synchronous)
        isForcedRef.current = false;

        setData(fetchedData);
        return fetchedData;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load calendar events';
        setError(err instanceof Error ? err : new Error(errorMessage));

        // Notify user of database fetch failure
        toast.error('Failed to load calendar events', {
          description: errorMessage,
          duration: 5000,
        });

        setSyncStatus({
          state: 'error',
          message: 'failed_to_load_events', // Translation key
          lastSyncTime: new Date(),
        });

        return null;
      }
    },
    refetchInterval: 60000, // Reduced from 30s to 60s to lower load
  });

  // Fetch google events with caching
  const { data: fetchedGoogleData, isLoading: isGoogleLoading } = useQuery({
    queryKey: ['googleCalendarEvents', wsId, getCacheKey(dates)],
    enabled:
      !!wsId && experimentalGoogleToken?.ws_id === wsId && dates.length > 0,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
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

        // Notify user of Google Calendar fetch failure
        toast.error('Failed to fetch Google Calendar', {
          description:
            errorMessage || 'Could not retrieve events from Google Calendar',
          duration: 5000,
        });

        setSyncStatus({
          state: 'error',
          message: 'failed_to_fetch_google', // Translation key
          lastSyncTime: new Date(),
        });

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
    refetchInterval: 60000, // Reduced from 30s to 60s to lower load
  });

  // Fetch habit calendar events to identify which events are habits
  const { data: habitEventData } = useQuery({
    queryKey: ['habitCalendarEvents', wsId, getCacheKey(dates)],
    enabled: !!wsId && dates.length > 0,
    staleTime: 60000, // Consider data fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    queryFn: async () => {
      const supabase = createClient();
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1]).endOf('day');

      // Fetch habit_calendar_events junction records for the date range
      // Note: Using type assertion until bun sb:push and bun sb:typegen are run
      // Filter by ws_id through the workspace_habits relation
      const { data: habitEvents, error } = await (supabase as any)
        .from('habit_calendar_events')
        .select(
          `
          event_id,
          habit_id,
          completed,
          workspace_habits!inner (
            ws_id
          ),
          workspace_calendar_events!inner (
            start_at,
            end_at
          )
        `
        )
        .eq('workspace_habits.ws_id', wsId)
        .lt(
          'workspace_calendar_events.start_at',
          endDate.add(1, 'day').toISOString()
        )
        .gt('workspace_calendar_events.end_at', startDate.toISOString());

      if (error) {
        console.error('Failed to fetch habit calendar events:', error);
        return {
          habitEventIds: new Set<string>(),
          completedHabitEventIds: new Set<string>(),
        };
      }

      // Build sets of habit event IDs and completed habit event IDs
      const habitEventIds = new Set<string>();
      const completedHabitEventIds = new Set<string>();

      (habitEvents || []).forEach((record: any) => {
        if (record.event_id) {
          habitEventIds.add(record.event_id);
          if (record.completed) {
            completedHabitEventIds.add(record.event_id);
          }
        }
      });

      return { habitEventIds, completedHabitEventIds };
    },
    refetchInterval: 60000, // Refetch every minute
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

    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId, cacheKey],
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
      }) => void,
      options?: { skipCooldown?: boolean }
    ) => {
      if (!isActiveSyncOn) {
        return;
      }

      // Cooldown check: prevent syncs more frequent than every 30 seconds (unless skipCooldown is true)
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncTimeRef.current;
      const SYNC_COOLDOWN_MS = 30000; // 30 seconds

      if (!options?.skipCooldown && timeSinceLastSync < SYNC_COOLDOWN_MS) {
        console.log(
          `🔒 Sync skipped - cooldown active (${Math.ceil((SYNC_COOLDOWN_MS - timeSinceLastSync) / 1000)}s remaining)`
        );
        return;
      }

      lastSyncTimeRef.current = now;
      setIsSyncing(true);
      setSyncStatus({
        state: 'syncing',
        message: 'syncing_calendars', // Translation key: calendar.syncing_calendars
        direction: 'google-to-tuturuuu',
      });

      try {
        // Check if we can proceed with sync
        const canProceed = await canProceedWithSync(wsId);
        if (!canProceed) {
          setSyncStatus({
            state: 'error',
            message: 'sync_in_progress', // Translation key
          });
          toast.error('Sync in progress', {
            description:
              'Another sync operation is already running. Please wait.',
          });
          return;
        }

        // Use fixed date range for consistent incremental sync (60 days past, 90 days future)
        // This ensures sync tokens work properly instead of constantly changing ranges
        // Reduced from 270 days to 150 days for better performance
        const now = new Date();
        const startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

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
          const errorMessage = errorData.error || 'Failed to sync calendar';

          setError(new Error(errorMessage));
          setSyncStatus({
            state: 'error',
            message: errorMessage,
            lastSyncTime: new Date(),
          });

          // Show detailed error toast
          toast.error('Calendar sync failed', {
            description: errorMessage,
            duration: 5000,
          });
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
        setSyncStatus({
          state: 'success',
          message: 'sync_completed', // Translation key
          lastSyncTime: new Date(),
          direction: 'google-to-tuturuuu',
        });

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
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred during sync';

        setError(error instanceof Error ? error : new Error(errorMessage));
        setSyncStatus({
          state: 'error',
          message: errorMessage,
          lastSyncTime: new Date(),
        });

        // Show critical error toast
        toast.error('Critical sync error', {
          description: errorMessage,
          duration: 7000,
        });
      } finally {
        setIsSyncing(false);
      }
    },
    [wsId, isActiveSyncOn, refresh]
  );

  // Sync to Tuturuuu database when google data changes for current view (debounced)
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
      // Clear any pending sync
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
      }

      // Debounce sync by 2 seconds to prevent rapid consecutive syncs
      syncDebounceTimerRef.current = setTimeout(() => {
        syncToTuturuuu();
        prevGoogleDataRef.current = currentGoogleDataStr;
      }, 2000);
    }

    // Cleanup on unmount
    return () => {
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
      }
    };
  }, [fetchedGoogleData, syncToTuturuuu, wsId, experimentalGoogleToken?.ws_id]);

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

  // Trigger refetch from DB when changing views (optimized to reduce load)
  useEffect(() => {
    // Skip if dates haven't actually changed
    if (areDatesEqual(dates)) {
      return;
    }

    const cacheKey = getCacheKey(dates);
    const cacheData = calendarCache[cacheKey];

    // For current week, force a fresh database fetch
    const isCurrentWeek = includesCurrentWeek(dates);

    if (cacheData && isCurrentWeek) {
      isForcedRef.current = true;
      // For current week, reset database cache timestamp to force refresh
      updateCache(cacheKey, {
        dbLastUpdated: 0,
      });
    }

    // Only invalidate database queries (cheap) - not Google queries (expensive)
    // Google sync will happen automatically via the 30s cooldown mechanism
    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId, getCacheKey(dates)],
    });
  }, [
    dates,
    queryClient,
    wsId,
    calendarCache,
    includesCurrentWeek,
    areDatesEqual,
    getCacheKey,
    updateCache,
  ]);

  /*
  Show data from database to Tuturuuu
  */

  // Create a unique signature for an event based on its content
  const createEventSignature = useCallback((event: CalendarEvent): string => {
    return `${event.title}|${event.description || ''}|${event.start_at}|${event.end_at}`;
  }, []);

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
          console.error(err);
        }
      }

      // Return the filtered list without duplicates
      return eventsData.filter((event) => !eventsToDelete.includes(event.id));
    },
    [wsId, queryClient, createEventSignature]
  );

  useEffect(() => {
    const processEvents = async () => {
      if (fetchedData) {
        const result = await removeDuplicateEvents(
          fetchedData as CalendarEvent[]
        );

        // Filter events by enabled calendars
        // If no calendar connections exist (not using Google Calendar), show all events
        // If connections exist, only show events from enabled calendars or events without a google_calendar_id
        const filteredEvents =
          calendarConnections.length > 0
            ? result.filter((event) => {
                const eventCalendarId = (event as any).google_calendar_id;
                // Show events without google_calendar_id (manually created events)
                // Or events from enabled calendars
                return (
                  !eventCalendarId || enabledCalendarIds.has(eventCalendarId)
                );
              })
            : result;

        // Merge habit info into events
        const habitEventIds =
          habitEventData?.habitEventIds || new Set<string>();
        const completedHabitEventIds =
          habitEventData?.completedHabitEventIds || new Set<string>();

        const eventsWithHabitInfo: CalendarEventWithHabitInfo[] =
          filteredEvents.map((event) => ({
            ...event,
            _isHabit: habitEventIds.has(event.id),
            _habitCompleted: completedHabitEventIds.has(event.id),
          }));

        setEvents(eventsWithHabitInfo);
      } else {
        setEvents([]);
      }
    };

    processEvents();
  }, [
    fetchedData,
    removeDuplicateEvents,
    calendarConnections.length,
    enabledCalendarIds,
    habitEventData,
  ]);

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
  }, []);

  const syncToGoogle = useCallback(async () => {
    // Helper to dispatch debug logs
    const logDebug = (
      type: 'info' | 'success' | 'warning' | 'error',
      message: string,
      details?: any
    ) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('calendar-debug-log', {
            detail: {
              id: `${Date.now()}-${Math.random()}`,
              timestamp: new Date(),
              type,
              message,
              details,
            },
          })
        );
      }
      console.log(
        `[SYNC TO GOOGLE ${type.toUpperCase()}]`,
        message,
        details || ''
      );
    };

    logDebug('info', '🚀 Starting sync to Google Calendar', {
      wsId,
      hasGoogleToken: !!experimentalGoogleToken,
      dateRange: dates.map((d) => d.toISOString()),
    });

    if (!experimentalGoogleToken || !wsId) {
      logDebug('error', 'Google Calendar not connected');
      toast.error('Google Calendar not connected', {
        description: 'Please connect your Google Calendar first',
      });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({
      state: 'syncing',
      message: 'syncing_to_google', // Translation key
      direction: 'tuturuuu-to-google',
    });

    try {
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1]).endOf('day');

      logDebug('info', '📅 Date range for sync', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      logDebug('info', '🔍 Current events in memory', {
        totalEvents: events.length,
        eventsWithGoogleId: events.filter((e: any) => e.google_event_id).length,
        eventsWithoutGoogleId: events.filter((e: any) => !e.google_event_id)
          .length,
      });

      const requestBody = {
        wsId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };

      logDebug('info', '📤 Sending API request', requestBody);

      const response = await fetch('/api/v1/calendar/auth/sync-to-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      logDebug('info', '📥 API response received', {
        status: response.status,
        ok: response.ok,
      });

      const result = await response.json();

      logDebug('info', '📊 API response data', result);

      if (!response.ok) {
        logDebug('error', 'API request failed', result);
        throw new Error(result.error || 'Failed to sync to Google Calendar');
      }

      // Update sync status
      setSyncStatus({
        state: 'success',
        message: `Synced ${result.syncedCount} event(s) to Google Calendar`,
        lastSyncTime: new Date(),
        direction: 'tuturuuu-to-google',
      });

      logDebug(
        'success',
        `✅ Sync completed: ${result.syncedCount} events synced`,
        result
      );

      // Show success notification
      toast.success('Synced to Google Calendar', {
        description: `${result.syncedCount} event(s) synced successfully`,
      });

      // If there were errors, show them
      if (result.errorCount > 0 && result.errors) {
        logDebug(
          'warning',
          `⚠️ ${result.errorCount} events failed to sync`,
          result.errors
        );
        toast.warning('Some events failed to sync', {
          description: `${result.errorCount} event(s) failed. Check debug panel for details.`,
          duration: 7000,
        });
      }

      // Refresh to ensure we have the latest data
      logDebug('info', '🔄 Refreshing events from database');
      refresh();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while syncing to Google';

      logDebug('error', '❌ Sync failed', { error, errorMessage });

      setError(error instanceof Error ? error : new Error(errorMessage));
      setSyncStatus({
        state: 'error',
        message: errorMessage,
        lastSyncTime: new Date(),
      });

      toast.error('Failed to sync to Google Calendar', {
        description: errorMessage,
        duration: 7000,
      });
    } finally {
      setIsSyncing(false);
      logDebug('info', '🏁 Sync operation completed');
    }
  }, [wsId, dates, experimentalGoogleToken, refresh, events]);

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

    // Calendar connections and filtering
    calendarConnections,
    enabledCalendarIds,
    updateCalendarConnection,
    setCalendarConnections,

    // Sync status
    syncStatus,

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

// Export types for use in other components
export type { CalendarConnection, SyncStatus };
