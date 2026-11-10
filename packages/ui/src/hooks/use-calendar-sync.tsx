'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listWorkspaceCalendars } from '@tuturuuu/internal-api/calendar';
import type {
  Workspace,
  WorkspaceCalendarEvent,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import {
  createContext,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from '../components/ui/sonner';
import { calendarQueryRange } from '../lib/calendar-day';
import type {
  CalendarConnection,
  CalendarOptimisticStatus,
  OptimisticCalendarPatchOptions,
  OptimisticCalendarState,
  OptimisticCalendarSyncEvent,
  CalendarSyncStatus as SyncStatus,
} from './calendar-connection-types';
import { runCalendarProviderSync } from './calendar-provider-sync';
import {
  CALENDAR_EVENTS_QUERY_ROOT,
  calendarEventsQueryOptions,
  keepCalendarEventsWithinScope,
  prefetchAdjacentCalendarRanges,
} from './calendar-events-query';
import { calendarEventInQueryRange } from './calendar-sync-range';
import {
  nativeOccurrencesKey,
  useNativeCalendarOccurrences,
} from './use-native-calendar-occurrences';
import { useWorkspaceActor } from './use-workspace-visibility';

// Extended CalendarEvent type with habit flags
export type CalendarEventWithHabitInfo = CalendarEvent & {
  _isHabit?: boolean;
  _habitCompleted?: boolean;
  _optimisticStatus?: CalendarOptimisticStatus;
};

export type { CalendarOptimisticStatus } from './calendar-connection-types';

const CalendarSyncContext = createContext<{
  data: WorkspaceCalendarEvent[] | null;
  googleData: WorkspaceCalendarEvent[] | null;
  error: Error | null;
  dates: Date[];
  timezone: string | undefined;
  setTimezone: (timezone: string | undefined) => void;

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
  setCalendarConnections: (
    connections: SetStateAction<CalendarConnection[]>
  ) => void;

  // Sync status
  syncStatus: SyncStatus;

  // Loading states
  /** True only while a range has no events at all: no cache and no placeholder. */
  isLoading: boolean;
  /** True while rows from the previous range stand in for the loading one. */
  isPlaceholderData: boolean;
  isSyncing: boolean;
}>({
  data: null,
  googleData: null,
  error: null,
  dates: [],
  timezone: undefined,
  setTimezone: () => {},
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
  isPlaceholderData: false,
  isSyncing: false,
});

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
  const [timezone, setTimezone] = useState<string>();
  const [currentView, setCurrentView] = useState<
    'day' | '4-day' | 'week' | 'month'
  >('day');
  const [isActiveSyncOn, setIsActiveSyncOn] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });
  const [optimisticState, setOptimisticState] =
    useState<OptimisticCalendarState>({
      events: {},
      removedIds: [],
    });
  const lastSyncTimeRef = useRef<number>(0);
  const queryClient = useQueryClient();
  const nativeOccurrences = useNativeCalendarOccurrences(
    wsId,
    dates,
    timezone,
    hasExternalEvents
  );

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

  const { data: workspaceCalendarsData } = useQuery({
    queryKey: ['workspace-calendars', wsId],
    enabled: !hasExternalEvents && !!wsId,
    queryFn: () => listWorkspaceCalendars(wsId),
    staleTime: 5 * 60_000,
  });
  const enabledWorkspaceCalendarIds = useMemo(
    () =>
      new Set(
        (workspaceCalendarsData?.calendars ?? [])
          .filter((calendar) => calendar.is_enabled)
          .map((calendar) => calendar.id)
      ),
    [workspaceCalendarsData?.calendars]
  );

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

  const setCalendarConnections = setCalendarConnectionsState;

  const actorId = useWorkspaceActor()?.actorId;
  const eventsQueryOptions = useMemo(
    () =>
      dates.length
        ? calendarEventsQueryOptions({ actorId, dates, timezone, wsId })
        : null,
    [actorId, dates, timezone, wsId]
  );

  const isVisibleInCurrentRange = useCallback(
    (event: { start_at?: string; end_at?: string }) =>
      calendarEventInQueryRange(event, dates, timezone),
    [dates, timezone]
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

  // Stale-while-revalidate per visible range: a cached range renders at once and
  // revalidates in the background, and the previous range's rows stand in while
  // a new range loads so the grid never swaps to a skeleton on navigation.
  const {
    data: fetchedData,
    isLoading: isDatabaseLoading,
    isPlaceholderData: isDatabasePlaceholder,
  } = useQuery<WorkspaceCalendarEvent[]>({
    queryKey: eventsQueryOptions?.queryKey ?? [
      CALENDAR_EVENTS_QUERY_ROOT,
      wsId,
    ],
    enabled: !hasExternalEvents && !!wsId && !!eventsQueryOptions,
    staleTime: eventsQueryOptions?.staleTime,
    gcTime: eventsQueryOptions?.gcTime,
    placeholderData: (previous, previousQuery) =>
      keepCalendarEventsWithinScope<WorkspaceCalendarEvent[]>(
        previous,
        previousQuery?.queryKey,
        { actorId, wsId }
      ),
    queryFn: async (context): Promise<WorkspaceCalendarEvent[]> => {
      if (!eventsQueryOptions) return [];

      try {
        // E2EE decryption happens in the API route; the payload is unchanged.
        const fetchedData = await eventsQueryOptions.queryFn(context);

        setError(null);
        setSyncStatus((currentStatus) =>
          currentStatus.state === 'error' &&
          currentStatus.message === 'failed_to_load_events'
            ? { state: 'idle' }
            : currentStatus
        );
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

        throw err instanceof Error ? err : new Error(errorMessage);
      }
    },
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  // Warm the previous and next range once the visible one is known. This only
  // fills the TanStack cache; nothing is read into component state.
  useEffect(() => {
    if (hasExternalEvents || !wsId || !eventsQueryOptions) return;
    void prefetchAdjacentCalendarRanges(queryClient, {
      actorId,
      dates,
      timezone,
      wsId,
    });
  }, [
    actorId,
    dates,
    eventsQueryOptions,
    hasExternalEvents,
    queryClient,
    timezone,
    wsId,
  ]);

  // Legacy direct Google fetch/reconcile is disabled. Provider inbound sync is
  // owned by the workspace sync route so account/calendar identity stays scoped.
  const { isLoading: isGoogleLoading } = useQuery({
    queryKey: ['googleCalendarEvents', wsId, eventsQueryOptions?.queryKey[2]],
    enabled: false,
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => null,
  });

  // Fetch habit calendar events to identify which events are habits
  const { data: habitEventData } = useQuery({
    queryKey: ['habitCalendarEvents', wsId, eventsQueryOptions?.queryKey[2]],
    enabled: !hasExternalEvents && !!wsId && dates.length > 0,
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === wsId ? previous : undefined,
    queryFn: async () => {
      const { start: startDate, end: endDate } = calendarQueryRange(
        dates,
        timezone
      );

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
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  // Invalidate and refetch events
  const refresh = useCallback(() => {
    if (hasExternalEvents) {
      externalRefresh?.();
      return null;
    }

    if (!eventsQueryOptions) return null;

    queryClient.invalidateQueries({ queryKey: nativeOccurrencesKey(wsId) });

    queryClient.invalidateQueries({
      queryKey: eventsQueryOptions.queryKey,
    });
  }, [
    queryClient,
    wsId,
    eventsQueryOptions,
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
        const result = await runCalendarProviderSync(queryClient, wsId);
        // Partial imports can change events even when another calendar fails.
        refresh();
        if (!result.ok) throw new Error(result.error || 'Calendar sync failed');

        setError(null);
        setSyncStatus({
          state: 'success',
          message: 'sync_completed', // Translation key
          lastSyncTime: new Date(),
          direction: 'google-to-tuturuuu',
        });

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
    [wsId, isActiveSyncOn, refresh, queryClient]
  );

  /*
  Show data from database to Tuturuuu
  */

  // Rows carried over from the previous range only count where they overlap the
  // visible one, so agenda and per-day consumers never list another week.
  const inRangeWhilePlaceholder = useCallback(
    <T extends { start_at?: string; end_at?: string }>(
      rows: T[],
      isPlaceholder: boolean
    ) =>
      isPlaceholder ? rows.filter((row) => isVisibleInCurrentRange(row)) : rows,
    [isVisibleInCurrentRange]
  );

  const visibleDatabaseEvents = useMemo(
    () =>
      hasExternalEvents
        ? ((externalEvents ?? []) as WorkspaceCalendarEvent[])
        : [
            ...inRangeWhilePlaceholder(
              fetchedData ?? [],
              isDatabasePlaceholder
            ),
            ...inRangeWhilePlaceholder(
              nativeOccurrences.data,
              nativeOccurrences.isPlaceholderData
            ),
          ],
    [
      externalEvents,
      fetchedData,
      hasExternalEvents,
      inRangeWhilePlaceholder,
      isDatabasePlaceholder,
      nativeOccurrences.data,
      nativeOccurrences.isPlaceholderData,
    ]
  );

  const visibleEventsWithOptimisticState = useMemo(() => {
    const removedIds = new Set(optimisticState.removedIds);

    // Filter native and external events using the same visibility controls as
    // the sidebar. Events without a source remain visible for backwards
    // compatibility with older calendar rows.
    const filteredEvents = !hasExternalEvents
      ? (visibleDatabaseEvents as CalendarEvent[]).filter((event) => {
          const sourceCalendarId = event.source_calendar_id;
          const eventCalendarId =
            event.external_calendar_id || event.google_calendar_id;

          if (
            sourceCalendarId &&
            (workspaceCalendarsData?.calendars.length ?? 0) > 0 &&
            !enabledWorkspaceCalendarIds.has(sourceCalendarId)
          ) {
            return false;
          }

          return (
            !eventCalendarId ||
            calendarConnections.length === 0 ||
            enabledCalendarIds.has(eventCalendarId)
          );
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
    enabledWorkspaceCalendarIds,
    hasExternalEvents,
    isVisibleInCurrentRange,
    optimisticState.events,
    optimisticState.removedIds,
    visibleDatabaseEvents,
    workspaceCalendarsData?.calendars.length,
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
      return !isAllDayEvent(event, timezone);
    });
  }, [events, timezone]);

  const allDayEvents = useMemo(() => {
    // Process events immediately when they change
    return events.filter((event) => {
      return isAllDayEvent(event, timezone);
    });
  }, [events, timezone]);

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
      : (fetchedData ?? null),
    googleData,
    error: error ?? nativeOccurrences.error,
    dates,
    setDates,
    timezone,
    setTimezone,
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
    // Skeleton gate: only when the range has no events to show, neither cached
    // nor carried over. Native occurrences stream in without blocking the grid.
    isLoading: externalEventsLoading || isDatabaseLoading || isGoogleLoading,
    isPlaceholderData: !hasExternalEvents && isDatabasePlaceholder,
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
