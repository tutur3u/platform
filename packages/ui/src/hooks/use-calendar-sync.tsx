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
  _optimisticStatus?: CalendarOptimisticStatus;
};

// Sync status type
type SyncStatus = {
  state: 'idle' | 'syncing' | 'success' | 'error';
  message?: string;
  lastSyncTime?: Date;
  direction?: 'google-to-tuturuuu' | 'tuturuuu-to-google' | 'both';
};

export type CalendarOptimisticStatus =
  | 'creating'
  | 'updating'
  | 'deleting'
  | 'error';

type OptimisticCalendarSyncEvent = Partial<
  Omit<CalendarEvent, 'color' | 'description' | 'location'>
> &
  Pick<CalendarEvent, 'id'> & {
    color?: CalendarEvent['color'] | string | null;
    description?: string | null;
    location?: string | null;
    _optimisticStatus?: CalendarOptimisticStatus;
  };

type OptimisticCalendarPatchOptions = {
  removeIds?: string[];
  clearIds?: string[];
  status?: CalendarOptimisticStatus;
};

type OptimisticCalendarState = {
  events: Record<string, OptimisticCalendarSyncEvent>;
  removedIds: string[];
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
    options?: OptimisticCalendarPatchOptions
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
  const [optimisticState, setOptimisticState] =
    useState<OptimisticCalendarState>({
      events: {},
      removedIds: [],
    });
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

  const activeCacheKey = useMemo(
    () => getCacheKey(dates),
    [dates, getCacheKey]
  );
  const activeCachedDatabaseEvents = activeCacheKey
    ? calendarCache[activeCacheKey]?.dbEvents
    : undefined;

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

  const isVisibleInCurrentRange = useCallback(
    (event: { start_at?: string; end_at?: string }) => {
      if (dates.length === 0) return true;

      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      if (!firstDate || !lastDate) return true;

      if (!event.start_at && !event.end_at) return true;

      const rangeStart = dayjs(firstDate).startOf('day').valueOf();
      const rangeEnd = dayjs(lastDate).endOf('day').valueOf();
      const startAt = event.start_at ? dayjs(event.start_at).valueOf() : NaN;
      const endAt = event.end_at ? dayjs(event.end_at).valueOf() : startAt;

      if (Number.isNaN(startAt) || Number.isNaN(endAt)) {
        return true;
      }

      return startAt <= rangeEnd && endAt >= rangeStart;
    },
    [dates]
  );

  const patchVisibleEvents = useCallback(
    (
      incomingEvents: OptimisticCalendarSyncEvent[],
      options?: OptimisticCalendarPatchOptions
    ) => {
      setOptimisticState((prev) => {
        const events = { ...prev.events };
        const removedIds = new Set(prev.removedIds);

        for (const id of options?.clearIds ?? []) {
          delete events[id];
          removedIds.delete(id);
        }

        for (const id of options?.removeIds ?? []) {
          delete events[id];
          removedIds.add(id);
        }

        for (const event of incomingEvents) {
          if (!event.id) continue;

          if (!isVisibleInCurrentRange(event)) {
            delete events[event.id];
            removedIds.add(event.id);
            continue;
          }

          removedIds.delete(event.id);

          const nextEvent: OptimisticCalendarSyncEvent = {
            ...(events[event.id] ?? {}),
            ...event,
          };

          if (options?.status) {
            nextEvent._optimisticStatus = options.status;
          } else {
            delete nextEvent._optimisticStatus;
          }

          events[event.id] = nextEvent;
        }

        return {
          events,
          removedIds: [...removedIds],
        };
      });
    },
    [isVisibleInCurrentRange]
  );

  // Fetch database events with caching
  const { data: fetchedData, isLoading: isDatabaseLoading } = useQuery({
    queryKey: ['databaseCalendarEvents', wsId, activeCacheKey],
    enabled: !hasExternalEvents && !!wsId && dates.length > 0,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    queryFn: async () => {
      if (!activeCacheKey) return null;

      const cachedData = calendarCache[activeCacheKey];

      // If we have cached data and it's not stale, return it immediately
      if (
        cachedData &&
        !isCacheStaleEnhanced(cachedData.dbLastUpdated, dates) &&
        !isForcedRef.current
      ) {
        return cachedData.dbEvents;
      }

      // Otherwise fetch fresh data via API (which handles E2EE decryption)
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1])
        .add(1, 'day')
        .startOf('day');

      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/calendar/events?start_at=${startDate.toISOString()}&end_at=${endDate.toISOString()}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch events');
        }

        const result = await response.json();
        const fetchedData = result.data || [];

        // Update cache with new data and reset isForced flag
        updateCache(activeCacheKey, {
          dbEvents: fetchedData,
          dbLastUpdated: Date.now(),
        });

        // Reset the ref immediately (synchronous)
        isForcedRef.current = false;

        setError(null);
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

        return cachedData?.dbEvents ?? [];
      }
    },
    refetchInterval: 60000, // Reduced from 30s to 60s to lower load
  });

  // Legacy direct Google fetch/reconcile is disabled. Provider inbound sync is
  // owned by the workspace sync route so account/calendar identity stays scoped.
  const { isLoading: isGoogleLoading } = useQuery({
    queryKey: ['googleCalendarEvents', wsId, activeCacheKey],
    enabled: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    queryFn: async () => null,
    refetchInterval: 60000, // Reduced from 30s to 60s to lower load
  });

  // Fetch habit calendar events to identify which events are habits
  const { data: habitEventData } = useQuery({
    queryKey: ['habitCalendarEvents', wsId, activeCacheKey],
    enabled: !hasExternalEvents && !!wsId && dates.length > 0,
    staleTime: 60000, // Consider data fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    queryFn: async () => {
      const startDate = dayjs(dates[0]).startOf('day');
      const endDate = dayjs(dates[dates.length - 1])
        .add(1, 'day')
        .startOf('day');

      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/calendar/habit-events?start_at=${startDate.toISOString()}&end_at=${endDate.toISOString()}`,
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

    if (!activeCacheKey) return null;

    isForcedRef.current = true;

    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId, activeCacheKey],
    });
  }, [queryClient, wsId, activeCacheKey, hasExternalEvents, externalRefresh]);

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

    const cacheData = calendarCache[activeCacheKey];

    // For current week, force a fresh database fetch
    const isCurrentWeek = includesCurrentWeek(dates);

    if (cacheData && isCurrentWeek) {
      isForcedRef.current = true;
      // For current week, reset database cache timestamp to force refresh
      updateCache(activeCacheKey, {
        dbLastUpdated: 0,
      });
    }
  }, [
    dates,
    calendarCache,
    includesCurrentWeek,
    areDatesEqual,
    activeCacheKey,
    updateCache,
    hasExternalEvents,
  ]);

  /*
  Show data from database to Tuturuuu
  */

  const visibleDatabaseEvents = useMemo(
    () =>
      hasExternalEvents
        ? ((externalEvents ?? []) as WorkspaceCalendarEvent[])
        : (fetchedData ?? activeCachedDatabaseEvents ?? []),
    [activeCachedDatabaseEvents, externalEvents, fetchedData, hasExternalEvents]
  );

  const visibleEventsWithOptimisticState = useMemo(() => {
    const removedIds = new Set(optimisticState.removedIds);

    // Filter external events by enabled provider calendars. Local Tuturuuu
    // events are always shown here; native calendar visibility is handled
    // by the workspace calendar endpoints.
    const filteredEvents =
      !hasExternalEvents && calendarConnections.length > 0
        ? (visibleDatabaseEvents as CalendarEvent[]).filter((event) => {
            const eventCalendarId =
              (event as any).external_calendar_id ||
              (event as any).google_calendar_id;
            return !eventCalendarId || enabledCalendarIds.has(eventCalendarId);
          })
        : (visibleDatabaseEvents as CalendarEvent[]);

    const byId = new Map<string, CalendarEvent>();

    for (const event of filteredEvents) {
      if (!event.id || removedIds.has(event.id)) continue;
      byId.set(event.id, event);
    }

    for (const optimisticEvent of Object.values(optimisticState.events)) {
      if (!optimisticEvent.id || removedIds.has(optimisticEvent.id)) continue;
      if (!isVisibleInCurrentRange(optimisticEvent)) continue;

      byId.set(optimisticEvent.id, {
        ...(byId.get(optimisticEvent.id) ?? {}),
        ...optimisticEvent,
      } as CalendarEvent);
    }

    return [...byId.values()].sort(
      (left, right) =>
        new Date(left.start_at).getTime() - new Date(right.start_at).getTime()
    );
  }, [
    calendarConnections.length,
    enabledCalendarIds,
    hasExternalEvents,
    isVisibleInCurrentRange,
    optimisticState.events,
    optimisticState.removedIds,
    visibleDatabaseEvents,
  ]);

  useEffect(() => {
    setOptimisticState((prev) => {
      const serverEventsById = new Map(
        (visibleDatabaseEvents as CalendarEvent[])
          .filter((event) => event.id)
          .map((event) => [event.id, event])
      );
      const nextEvents = { ...prev.events };
      const nextRemovedIds = prev.removedIds.filter((id) =>
        serverEventsById.has(id)
      );
      let changed = nextRemovedIds.length !== prev.removedIds.length;

      for (const [id, event] of Object.entries(prev.events)) {
        const serverEvent = serverEventsById.get(id);

        if (
          !event._optimisticStatus &&
          serverEvent &&
          (event.title === undefined || serverEvent.title === event.title) &&
          (event.description === undefined ||
            serverEvent.description === event.description) &&
          (event.start_at === undefined ||
            serverEvent.start_at === event.start_at) &&
          (event.end_at === undefined || serverEvent.end_at === event.end_at) &&
          (event.color === undefined || serverEvent.color === event.color) &&
          (event.location === undefined ||
            serverEvent.location === event.location) &&
          (event.locked === undefined || serverEvent.locked === event.locked)
        ) {
          delete nextEvents[id];
          changed = true;
        }
      }

      return changed
        ? {
            events: nextEvents,
            removedIds: nextRemovedIds,
          }
        : prev;
    });
  }, [visibleDatabaseEvents]);

  useEffect(() => {
    const habitEventIds = habitEventData?.habitEventIds || new Set<string>();
    const completedHabitEventIds =
      habitEventData?.completedHabitEventIds || new Set<string>();

    const eventsWithHabitInfo: CalendarEventWithHabitInfo[] =
      visibleEventsWithOptimisticState.map((event) => ({
        ...event,
        _isHabit: habitEventIds.has(event.id),
        _habitCompleted: completedHabitEventIds.has(event.id),
      }));

    setEvents(eventsWithHabitInfo);
  }, [habitEventData, visibleEventsWithOptimisticState]);

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
      : (fetchedData ?? activeCachedDatabaseEvents ?? null),
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
