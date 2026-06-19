'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Workspace,
  WorkspaceCalendarEvent,
  WorkspaceCalendarGoogleTokenClient,
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
  provider?: 'google' | 'microsoft' | string;
  auth_token_id?: string | null;
  workspace_calendar_id?: string | null;
  access_role?: string | null;
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

type OptimisticCalendarSyncEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  color?: string | null;
  locked?: boolean;
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
    }) => void,
    options?: { skipCooldown?: boolean }
  ) => Promise<void>;

  isActiveSyncOn: boolean;

  // Events-related operations
  events: CalendarEventWithHabitInfo[];
  setIsActiveSyncOn: (isActive: boolean) => void;
  // Show data from database to Tuturuuu
  eventsWithoutAllDays: CalendarEvent[];
  allDayEvents: CalendarEvent[];
  refresh: () => void;
  patchVisibleEvents: (
    events: OptimisticCalendarSyncEvent[],
    options?: { removeIds?: string[] }
  ) => void;

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
  patchVisibleEvents: () => {},

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
  experimentalGoogleToken: _experimentalGoogleToken,
  initialCalendarConnections = [],
  externalEvents,
  externalEventsLoading = false,
  externalRefresh,
}: {
  children: React.ReactNode;
  wsId: Workspace['id'];
  experimentalGoogleToken?: WorkspaceCalendarGoogleTokenClient | null;
  initialCalendarConnections?: CalendarConnection[];
  externalEvents?: CalendarEvent[];
  externalEventsLoading?: boolean;
  externalRefresh?: () => void;
}) => {
  const [data, setData] = useState<WorkspaceCalendarEvent[] | null>(null);
  const [googleData] = useState<WorkspaceCalendarEvent[] | null>(null);
  const [events, setEvents] = useState<CalendarEventWithHabitInfo[]>([]);
  const hasExternalEvents = externalEvents !== undefined;

  const [error, setError] = useState<Error | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [currentView, setCurrentView] = useState<
    'day' | '4-day' | 'week' | 'month'
  >('day');
  const [isActiveSyncOn, setIsActiveSyncOn] = useState(true);
  const [calendarCache, setCalendarCache] = useState<CalendarCache>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });
  const prevDatesRef = useRef<string>('');
  const isForcedRef = useRef<boolean>(false);
  const lastSyncTimeRef = useRef<number>(0);
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

  const patchVisibleEvents = useCallback(
    (
      incomingEvents: OptimisticCalendarSyncEvent[],
      options?: { removeIds?: string[] }
    ) => {
      const cacheKey = getCacheKey(dates);
      if (!cacheKey) return;

      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      if (!firstDate || !lastDate) return;

      const rangeStart = dayjs(firstDate).startOf('day').valueOf();
      const rangeEnd = dayjs(lastDate).endOf('day').valueOf();
      const removeIds = new Set(options?.removeIds ?? []);

      const isVisibleInRange = (event: {
        start_at?: string;
        end_at?: string;
      }) => {
        const startAt = event.start_at ? dayjs(event.start_at).valueOf() : NaN;
        const endAt = event.end_at ? dayjs(event.end_at).valueOf() : startAt;

        return !Number.isNaN(startAt) && !Number.isNaN(endAt)
          ? startAt <= rangeEnd && endAt >= rangeStart
          : false;
      };

      const mergeEvents = (existingData: WorkspaceCalendarEvent[] | null) => {
        const existing = Array.isArray(existingData) ? existingData : [];
        const byId = new Map(
          existing
            .filter((event) => !removeIds.has(event.id))
            .map((event) => [event.id, event])
        );

        for (const event of incomingEvents) {
          if (!event.id || !isVisibleInRange(event)) continue;
          byId.set(event.id, {
            ...(byId.get(event.id) ?? {}),
            ...event,
          } as WorkspaceCalendarEvent);
        }

        return [...byId.values()].sort(
          (left, right) =>
            new Date(left.start_at).getTime() -
            new Date(right.start_at).getTime()
        );
      };

      const nextDbEvents = mergeEvents(
        calendarCache[cacheKey]?.dbEvents ?? data ?? []
      );

      updateCache(cacheKey, {
        dbEvents: nextDbEvents,
        dbLastUpdated: Date.now(),
      });
      setData(nextDbEvents);
      queryClient.setQueryData(
        ['databaseCalendarEvents', wsId, cacheKey],
        nextDbEvents
      );
    },
    [calendarCache, data, dates, getCacheKey, queryClient, updateCache, wsId]
  );

  // Fetch database events with caching
  const { data: fetchedData, isLoading: isDatabaseLoading } = useQuery({
    queryKey: ['databaseCalendarEvents', wsId, getCacheKey(dates)],
    enabled: !hasExternalEvents && !!wsId && dates.length > 0,
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
          `/api/v1/workspaces/${wsId}/calendar/events?start_at=${startDate.toISOString()}&end_at=${endDate.add(1, 'day').toISOString()}`,
          { cache: 'no-store' }
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

  // Legacy direct Google fetch/reconcile is disabled. Provider inbound sync is
  // owned by the workspace sync route so account/calendar identity stays scoped.
  const { isLoading: isGoogleLoading } = useQuery({
    queryKey: ['googleCalendarEvents', wsId, getCacheKey(dates)],
    enabled: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    queryFn: async () => null,
    refetchInterval: 60000, // Reduced from 30s to 60s to lower load
  });

  // Fetch habit calendar events to identify which events are habits
  const { data: habitEventData } = useQuery({
    queryKey: ['habitCalendarEvents', wsId, getCacheKey(dates)],
    enabled: !hasExternalEvents && !!wsId && dates.length > 0,
    staleTime: 60000, // Consider data fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    queryFn: async () => {
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1]).endOf('day');

      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/calendar/habit-events?start_at=${startDate.toISOString()}&end_at=${endDate.add(1, 'day').toISOString()}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.error || 'Failed to fetch habit calendar events'
          );
        }

        const result = (await response.json()) as {
          habitEventIds?: string[];
          completedHabitEventIds?: string[];
        };

        return {
          habitEventIds: new Set(result.habitEventIds ?? []),
          completedHabitEventIds: new Set(result.completedHabitEventIds ?? []),
        };
      } catch (error) {
        console.error('Failed to fetch habit calendar events:', error);
        return {
          habitEventIds: new Set<string>(),
          completedHabitEventIds: new Set<string>(),
        };
      }
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
    if (hasExternalEvents) {
      externalRefresh?.();
      return null;
    }

    const cacheKey = getCacheKey(dates);
    if (!cacheKey) return null;

    isForcedRef.current = true;

    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId, cacheKey],
    });
  }, [
    queryClient,
    wsId,
    dates,
    getCacheKey,
    hasExternalEvents,
    externalRefresh,
  ]);

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
        // Use fixed date range for consistent incremental sync (60 days past, 90 days future)
        // This ensures sync tokens work properly instead of constantly changing ranges
        // Reduced from 270 days to 150 days for better performance
        const activeSyncResponse = await fetch(
          `/api/v1/workspaces/${wsId}/calendar/sync`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              direction: 'inbound',
              source: 'manual',
            }),
          }
        );

        if (!activeSyncResponse.ok) {
          const errorData = await activeSyncResponse.json();
          const errorMessage =
            errorData.error ||
            (errorData.code === 'sync_already_running'
              ? 'sync_in_progress'
              : 'Failed to sync calendar');

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

        await activeSyncResponse.json();

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

  // Trigger refetch from DB when changing views (optimized to reduce load)
  useEffect(() => {
    if (hasExternalEvents) {
      return;
    }

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
    hasExternalEvents,
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
          for (const eventId of eventsToDelete) {
            const response = await fetch(
              `/api/v1/workspaces/${wsId}/calendar/events/${eventId}`,
              {
                method: 'DELETE',
              }
            );

            if (!response.ok) {
              // Error deleting duplicate events
              continue;
            }

            deletionPerformed = true;
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

  const visibleDatabaseEvents = hasExternalEvents
    ? ((externalEvents ?? []) as WorkspaceCalendarEvent[])
    : (data ?? fetchedData ?? null);

  useEffect(() => {
    const processEvents = async () => {
      if (visibleDatabaseEvents) {
        const result = hasExternalEvents
          ? (visibleDatabaseEvents as CalendarEvent[])
          : await removeDuplicateEvents(
              visibleDatabaseEvents as CalendarEvent[]
            );

        // Filter external events by enabled provider calendars. Local Tuturuuu
        // events are always shown here; native calendar visibility is handled
        // by the workspace calendar endpoints.
        const filteredEvents =
          !hasExternalEvents && calendarConnections.length > 0
            ? result.filter((event) => {
                const eventCalendarId =
                  (event as any).external_calendar_id ||
                  (event as any).google_calendar_id;
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
    visibleDatabaseEvents,
    removeDuplicateEvents,
    calendarConnections.length,
    enabledCalendarIds,
    habitEventData,
    hasExternalEvents,
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
    toast.info('Provider events sync when you create or edit them.');
    setSyncStatus({
      state: 'success',
      message: 'provider_writes_on_save',
      lastSyncTime: new Date(),
      direction: 'tuturuuu-to-google',
    });
  }, []);

  const value = {
    data: hasExternalEvents
      ? ((externalEvents ?? []) as WorkspaceCalendarEvent[])
      : data,
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
    patchVisibleEvents,

    // Calendar connections and filtering
    calendarConnections,
    enabledCalendarIds,
    updateCalendarConnection,
    setCalendarConnections,

    // Sync status
    syncStatus,

    // Loading states
    isLoading: externalEventsLoading || isDatabaseLoading || isGoogleLoading,
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
