import {
  createWorkspaceCalendarEvent,
  deleteWorkspaceCalendarEvent,
  updateWorkspaceCalendarEvent,
  type WorkspaceCalendarEventCreatePayload,
  type WorkspaceCalendarEventUpdatePayload,
} from '@tuturuuu/internal-api';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Workspace,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import {
  createAllDayEvent,
  isAllDayEvent,
} from '@tuturuuu/utils/calendar-utils';
import dayjs from 'dayjs';
import moment from 'moment';
import 'moment/locale/vi';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCalendarSync } from './use-calendar-sync';

// Utility function to round time to nearest 15-minute interval
const roundToNearest15Minutes = (date: Date): Date => {
  const minutes = date.getMinutes();
  const remainder = minutes % 15;
  const roundedMinutes =
    remainder < 8 ? minutes - remainder : minutes + (15 - remainder);
  const roundedDate = new Date(date);
  roundedDate.setMinutes(roundedMinutes);
  roundedDate.setSeconds(0);
  roundedDate.setMilliseconds(0);
  return roundedDate;
};

type TaskDragData = {
  name?: string;
  priority?: string | null;
  totalDuration?: number;
};

const createOptimisticEventId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `optimistic-${crypto.randomUUID()}`;
  }

  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const noStoreFetchOptions = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, cache: 'no-store' }),
};

function patchWorkspaceCalendarEventCache(
  queryClient: any,
  wsId: string,
  updater: (events: CalendarEvent[]) => CalendarEvent[]
) {
  queryClient.setQueriesData(
    { queryKey: ['databaseCalendarEvents', wsId], exact: false },
    (existing: CalendarEvent[] | null | undefined) =>
      updater(Array.isArray(existing) ? existing : [])
  );
}

function invalidateTaskSchedulingQueries(queryClient: any, wsId?: string) {
  queryClient.invalidateQueries({ queryKey: ['schedulable-tasks'] });
  queryClient.invalidateQueries({ queryKey: ['scheduled-events-batch'] });
  queryClient.invalidateQueries({ queryKey: ['task-schedule-batch'] });
  queryClient.invalidateQueries({
    queryKey: ['task-schedule-history'],
    exact: false,
  });
  queryClient.invalidateQueries({
    queryKey: ['habit-schedule-history'],
    exact: false,
  });

  if (wsId) {
    queryClient.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId],
      exact: false,
    });
    queryClient.invalidateQueries({
      queryKey: ['habits', wsId],
      exact: false,
    });
  }
}

// Updated context with improved type definitions
const CalendarContext = createContext<{
  getEvent: (eventId: string) => CalendarEvent | undefined;
  getCurrentEvents: (date?: Date) => CalendarEvent[];
  getUpcomingEvent: () => CalendarEvent | undefined;
  getEvents: () => CalendarEvent[];
  getGoogleEvents: () => CalendarEvent[];
  getEventLevel: (eventId: string) => number;
  addEvent: (
    event: Omit<CalendarEvent, 'id'>
  ) => Promise<CalendarEvent | undefined>;
  addEmptyEvent: (date: Date, isAllDay?: boolean) => CalendarEvent;
  addEmptyEventWithDuration: (startDate: Date, endDate: Date) => CalendarEvent;
  updateEvent: (
    eventId: string,
    data: Partial<CalendarEvent>
  ) => Promise<CalendarEvent | undefined>;
  deleteEvent: (eventId: string) => Promise<void>;
  isModalOpen: boolean;
  activeEvent: CalendarEvent | undefined;
  isPreviewOpen: boolean;
  previewEvent: CalendarEvent | undefined;
  openModal: (
    eventId?: string,
    modalType?: 'all-day' | 'event',
    options?: { defaultNewEventTab?: 'manual' | 'ai' }
  ) => void;
  openEventEditor: (
    eventId?: string,
    options?: { defaultNewEventTab?: 'manual' | 'ai' }
  ) => void;
  closePreview: () => void;
  closeModal: () => void;
  isEditing: () => boolean;
  hideModal: () => void;
  showModal: () => void;
  getModalStatus: (id: string) => boolean;
  getActiveEvent: () => CalendarEvent | undefined;
  isModalActive: () => boolean;
  // google calendar API
  syncGoogleCalendarNow: (
    progressCallback?: (progress: {
      phase: 'fetch' | 'delete' | 'update' | 'insert' | 'complete';
      current: number;
      total: number;
      changesMade: boolean;
      statusMessage?: string;
    }) => void
  ) => Promise<boolean>;

  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  hoveredBaseEventId: string | null;
  setHoveredBaseEventId: (id: string | null) => void;
  hoveredEventColumn: number | null;
  setHoveredEventColumn: (column: number | null) => void;
  // Task scheduling
  scheduleTaskAsEvent?: (
    taskId: string,
    startAt: Date,
    endAt: Date,
    taskData?: TaskDragData
  ) => Promise<void>;
  // Callback when a task is scheduled (for UI refresh)
  onTaskScheduled?: () => void;
  setOnTaskScheduled: (callback: (() => void) | undefined) => void;
  // Preview events (for demo/preview mode)
  previewEvents: CalendarEvent[];
  setPreviewEvents: (events: CalendarEvent[]) => void;
  clearPreviewEvents: () => void;
  // Affected events (events that will be modified/deleted during preview)
  affectedEventIds: Set<string>;
  setAffectedEventIds: (ids: Set<string> | string[]) => void;
  clearAffectedEventIds: () => void;
  // Hide non-preview events during preview mode (for performance)
  hideNonPreviewEvents: boolean;
  setHideNonPreviewEvents: (hide: boolean) => void;
  // UX: allow callers (e.g. create button) to influence default tab for *new* events.
  defaultNewEventTab: 'manual' | 'ai';
  disableBuiltInEventUi: boolean;
  preservePastEventOpacity: boolean;
  renderEventContextMenu?: (event: CalendarEvent) => ReactNode;
  isEventReadOnly: (event: CalendarEvent) => boolean;
  readOnly: boolean;
}>({
  getEvent: () => undefined,
  getCurrentEvents: () => [],
  getUpcomingEvent: () => undefined,
  getEvents: () => [],
  getGoogleEvents: () => [],
  getEventLevel: () => 0,
  addEvent: () => Promise.resolve({} as CalendarEvent),
  addEmptyEvent: () => ({}) as CalendarEvent,
  addEmptyEventWithDuration: () => ({}) as CalendarEvent,
  updateEvent: () => Promise.resolve({} as CalendarEvent),
  deleteEvent: () => Promise.resolve(),
  isModalOpen: false,
  activeEvent: undefined,
  isPreviewOpen: false,
  previewEvent: undefined,
  openModal: () => undefined,
  openEventEditor: () => undefined,
  closePreview: () => undefined,
  closeModal: () => undefined,
  isEditing: () => false,
  hideModal: () => undefined,
  showModal: () => undefined,
  getModalStatus: () => false,
  getActiveEvent: () => undefined,
  isModalActive: () => false,
  // Google Calendar API
  syncGoogleCalendarNow: () => Promise.resolve(false),

  isDragging: false,
  setIsDragging: () => undefined,
  hoveredBaseEventId: null,
  setHoveredBaseEventId: () => undefined,
  hoveredEventColumn: null,
  setHoveredEventColumn: () => undefined,
  // Task scheduling
  scheduleTaskAsEvent: undefined,
  // Callback when a task is scheduled
  onTaskScheduled: undefined,
  setOnTaskScheduled: () => undefined,
  // Preview events
  previewEvents: [],
  setPreviewEvents: () => undefined,
  clearPreviewEvents: () => undefined,
  // Affected events
  affectedEventIds: new Set<string>(),
  setAffectedEventIds: () => undefined,
  clearAffectedEventIds: () => undefined,
  // Hide non-preview events
  hideNonPreviewEvents: false,
  setHideNonPreviewEvents: () => undefined,
  defaultNewEventTab: 'manual',
  disableBuiltInEventUi: false,
  preservePastEventOpacity: false,
  renderEventContextMenu: undefined,
  isEventReadOnly: () => false,
  readOnly: false,
});

// Add this interface before the updateEvent function
interface PendingEventUpdate extends Partial<CalendarEvent> {
  _updateId?: string;
  _timestamp: number;
  _eventId: string;
  _previousEvent?: CalendarEvent;
  _resolvers?: Array<{
    resolve: (value: CalendarEvent) => void;
    reject: (reason: unknown) => void;
  }>;
}

export type CalendarEventAdapter = {
  disableBuiltInEventUi?: boolean;
  preservePastEventOpacity?: boolean;
  renderContextMenu?: (event: CalendarEvent) => ReactNode;
  isEventReadOnly?: (event: CalendarEvent) => boolean;
  onCreate?: (
    event: Omit<CalendarEvent, 'id'>
  ) => Promise<CalendarEvent | undefined> | CalendarEvent | undefined;
  onCreateDraft?: (event: CalendarEvent) => void;
  onDelete?: (eventId: string, event?: CalendarEvent) => Promise<void> | void;
  onOpen?: (eventId?: string, event?: CalendarEvent) => void;
  onUpdate?: (
    eventId: string,
    updates: Partial<CalendarEvent>,
    event?: CalendarEvent
  ) => Promise<CalendarEvent | undefined> | CalendarEvent | undefined;
};

/**
 * Syncs task total_duration after a calendar event is resized or moved.
 * - Uses canonical workspace calendar events as the source of truth
 * - If total scheduled time exceeds task's total_duration, auto-increase it
 */
async function syncTaskDurationAfterEventChange(
  supabase: any,
  eventId: string,
  eventData: { start_at: string; end_at: string; task_id?: string | null },
  options?: { calendarWsId?: string; isPersonalCalendar?: boolean }
) {
  try {
    // Get task_id either from event or junction table
    let taskId = eventData.task_id;

    if (!taskId) {
      // Try to find task from junction table
      const { data: junction } = await supabase
        .from('task_calendar_events')
        .select('task_id')
        .eq('event_id', eventId)
        .single();

      if (!junction?.task_id) {
        // No linked task, nothing to sync
        return;
      }
      taskId = junction.task_id;
    }

    const calendarWsId = options?.calendarWsId;
    if (!calendarWsId) {
      return;
    }
    const resizedEventMinutes = Math.round(
      (new Date(eventData.end_at).getTime() -
        new Date(eventData.start_at).getTime()) /
        60000
    );

    let totalScheduledMinutes = resizedEventMinutes;

    const scheduleResponse = await fetch(
      options?.isPersonalCalendar
        ? `/api/v1/users/me/tasks/${taskId}/schedule`
        : `/api/v1/workspaces/${calendarWsId}/tasks/${taskId}/schedule`,
      {
        cache: 'no-store',
      }
    );

    if (scheduleResponse.ok) {
      const schedulePayload = (await scheduleResponse.json()) as {
        scheduling?: {
          scheduledMinutes?: number;
        };
      };

      if (
        typeof schedulePayload.scheduling?.scheduledMinutes === 'number' &&
        Number.isFinite(schedulePayload.scheduling.scheduledMinutes)
      ) {
        totalScheduledMinutes = schedulePayload.scheduling.scheduledMinutes;
      }
    }

    const totalScheduledHours = totalScheduledMinutes / 60;

    // Personal workspace calendars should not mutate shared task duration.
    // Instead, keep a per-user scheduling estimate.
    if (options?.isPersonalCalendar) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const { data: existing } = await supabase
        .from('task_user_scheduling_settings')
        .select('total_duration')
        .eq('task_id', taskId)
        .eq('user_id', user.id)
        .maybeSingle();

      const currentDuration = (existing as any)?.total_duration || 0;
      if (totalScheduledHours > currentDuration) {
        const { error: updateError } = await supabase
          .from('task_user_scheduling_settings')
          .upsert(
            {
              task_id: taskId,
              user_id: user.id,
              total_duration: totalScheduledHours,
            },
            { onConflict: 'task_id,user_id' }
          );
        if (updateError) {
          console.error(
            'Failed to update personal task duration:',
            updateError
          );
        }
      }
      return;
    }

    // Non-personal calendars also use per-user scheduling settings.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;

    const { data: existing } = await supabase
      .from('task_user_scheduling_settings')
      .select('total_duration')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();

    const currentDuration = (existing as any)?.total_duration || 0;
    if (totalScheduledHours > currentDuration) {
      const { error: updateError } = await supabase
        .from('task_user_scheduling_settings')
        .upsert(
          {
            task_id: taskId,
            user_id: user.id,
            total_duration: totalScheduledHours,
          },
          { onConflict: 'task_id,user_id' }
        );

      if (updateError) {
        console.error('Failed to update task duration:', updateError);
      }
    }
  } catch (error) {
    console.error('Error syncing task duration:', error);
  }
}

export const CalendarProvider = ({
  ws,
  useQuery: _useQuery,
  useQueryClient,
  children,
  experimentalGoogleToken: _experimentalGoogleToken,
  eventAdapter,
  readOnly = false,
}: {
  ws?: Workspace;
  useQuery: any;
  useQueryClient: any;
  children: ReactNode;
  experimentalGoogleToken?: WorkspaceCalendarGoogleTokenClient | null;
  eventAdapter?: CalendarEventAdapter;
  readOnly?: boolean;
}) => {
  const queryClient = useQueryClient();

  // Add debounce timer reference for update events
  const updateDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Map<string, PendingEventUpdate>>(
    new Map<string, PendingEventUpdate>()
  );

  // Queue for processing updates in order
  const updateQueueRef = useRef<PendingEventUpdate[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);

  const { events, refresh, patchVisibleEvents } = useCalendarSync();

  // Modal state
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [previewEventId, setPreviewEventId] = useState<string | null>(null);
  const [isModalHidden, setModalHidden] = useState(false);
  const [pendingNewEvent, setPendingNewEvent] =
    useState<Partial<CalendarEvent> | null>(null);
  const [defaultNewEventTab, setDefaultNewEventTab] = useState<'manual' | 'ai'>(
    'manual'
  );

  // Callback for when a task is scheduled (allows components to refresh)
  const [onTaskScheduled, setOnTaskScheduled] = useState<
    (() => void) | undefined
  >(undefined);

  // Preview events state (for demo/preview mode)
  const [previewEvents, setPreviewEventsState] = useState<CalendarEvent[]>([]);

  // Affected events state (events that will be modified/deleted during preview)
  const [affectedEventIds, setAffectedEventIdsState] = useState<Set<string>>(
    new Set()
  );

  // Wrapper functions for preview events
  const setPreviewEvents = useCallback((newEvents: CalendarEvent[]) => {
    // Add preview flags to all events
    const eventsWithFlags = newEvents.map((e) => ({
      ...e,
      _isPreview: true as const,
    }));
    setPreviewEventsState(eventsWithFlags);
  }, []);

  const clearPreviewEvents = useCallback(() => {
    setPreviewEventsState([]);
    // Also clear affected events and hide state when clearing preview
    setAffectedEventIdsState(new Set());
    setHideNonPreviewEvents(false);
  }, []);

  // Wrapper functions for affected events
  const setAffectedEventIds = useCallback((ids: Set<string> | string[]) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    setAffectedEventIdsState(idSet);
  }, []);

  const clearAffectedEventIds = useCallback(() => {
    setAffectedEventIdsState(new Set());
  }, []);

  // Hide non-preview events state (for performance during preview)
  const [hideNonPreviewEvents, setHideNonPreviewEvents] = useState(false);

  // Event getters
  const getEvent = useCallback(
    (eventId: string) => {
      // Handle IDs for split multi-day events (they contain a dash and date)
      const originalId = eventId.includes('-')
        ? eventId.split('-')[0]
        : eventId;
      return events.find((e: Partial<CalendarEvent>) => e.id === originalId);
    },
    [events]
  );

  const getCurrentEvents = useCallback(
    (date?: Date) => {
      const targetDate = date || new Date();
      const targetDay = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate()
      );

      return events.filter((e: CalendarEvent) => {
        const eventStart = new Date(e.start_at);
        const eventEnd = new Date(e.end_at);

        // Normalize dates to compare just the date part (ignoring time)
        const eventStartDay = new Date(
          eventStart.getFullYear(),
          eventStart.getMonth(),
          eventStart.getDate()
        );

        const eventEndDay = new Date(
          eventEnd.getFullYear(),
          eventEnd.getMonth(),
          eventEnd.getDate()
        );

        // Use only time-based logic for all-day detection
        const isAllDay = isAllDayEvent(e);

        // For all-day events, treat end date as exclusive (consistent with week view)
        // For timed events, treat end date as inclusive
        if (isAllDay) {
          return eventStartDay <= targetDay && eventEndDay > targetDay;
        } else {
          return eventStartDay <= targetDay && eventEndDay >= targetDay;
        }
      });
    },
    [events]
  );

  const getUpcomingEvent = useCallback(() => {
    const now = new Date();
    // Get the next event that is happening
    return events.find((e: CalendarEvent) => {
      const start = e.start_at;
      const end = e.end_at;
      const startDate = moment(start).toDate();
      const endDate = moment(end).toDate();
      const isSameDay =
        startDate.getDate() === now.getDate() &&
        startDate.getMonth() === now.getMonth() &&
        startDate.getFullYear() === now.getFullYear();
      return isSameDay && startDate > now && endDate > now;
    });
  }, [events]);

  // Merge real events with preview events
  const getEvents = useCallback(() => {
    return [...events, ...previewEvents];
  }, [events, previewEvents]);

  // Event level calculation for overlapping events
  const getEventLevel = useCallback(
    (eventId: string) => {
      // Handle IDs for split multi-day events (they contain a dash and date)
      const originalId = eventId.includes('-')
        ? eventId.split('-')[0]
        : eventId;
      const event = events.find((e: CalendarEvent) => e.id === originalId);
      if (!event) return 0;

      const eventIndex = events.findIndex(
        (e: CalendarEvent) => e.id === originalId
      );
      const prevEvents = events
        .slice(0, eventIndex)
        .filter((e: CalendarEvent) => {
          if (e.id === originalId) return false;

          const eventStart = moment(event.start_at).toDate();
          const eventEnd = moment(event.end_at).toDate();
          const eStart = moment(e.start_at).toDate();
          const eEnd = moment(e.end_at).toDate();

          // For multi-day events, we need to check if they overlap on the same day
          const eventStartDay = new Date(
            eventStart.getFullYear(),
            eventStart.getMonth(),
            eventStart.getDate()
          );

          const eStartDay = new Date(
            eStart.getFullYear(),
            eStart.getMonth(),
            eStart.getDate()
          );

          if (eventStartDay.getTime() !== eStartDay.getTime()) return false;

          // Check for time overlap
          return !(eEnd <= eventStart || eStart >= eventEnd);
        });

      if (prevEvents.length === 0) return 0;

      const prevEventLevels = prevEvents.map((e: CalendarEvent) =>
        getEventLevel(e.id)
      ) as number[];

      return Math.max(...prevEventLevels) + 1;
    },
    [events]
  );

  // CRUD operations with Supabase
  const addEvent = useCallback(
    async (event: Omit<CalendarEvent, 'id'>) => {
      if (readOnly) {
        console.warn('Calendar is in read-only mode');
        return undefined;
      }

      // Round start and end times to nearest 15-minute interval
      const startDate = roundToNearest15Minutes(new Date(event.start_at));
      const endDate = roundToNearest15Minutes(new Date(event.end_at));

      const eventColor = event.color || 'BLUE';

      if (eventAdapter?.onCreate) {
        const created = await eventAdapter.onCreate({
          ...event,
          start_at: startDate.toISOString(),
          end_at: endDate.toISOString(),
          color: eventColor as SupportedColor,
        });
        setPendingNewEvent(null);
        refresh();
        return created;
      }

      if (!ws) throw new Error('No workspace selected');

      const payload: WorkspaceCalendarEventCreatePayload = {
        title: event.title || '',
        description: event.description || '',
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        color: eventColor as SupportedColor,
        location: event.location || '',
        locked: true,
        task_id: (event as CalendarEvent & { task_id?: string | null }).task_id,
        source: event.source,
      };
      const optimisticId = createOptimisticEventId();
      const optimisticEvent = {
        ...event,
        ...payload,
        id: optimisticId,
        ws_id: ws.id,
        color: eventColor as SupportedColor,
        _optimisticStatus: 'creating' as const,
      };

      patchVisibleEvents([optimisticEvent], { status: 'creating' });

      try {
        const data = await createWorkspaceCalendarEvent(
          ws.id,
          payload,
          noStoreFetchOptions
        );

        patchVisibleEvents([data], { clearIds: [optimisticId] });
        patchWorkspaceCalendarEventCache(queryClient, ws.id, (existing) => {
          if (existing.some((item) => item.id === data.id)) {
            return existing.map((item) =>
              item.id === data.id
                ? ({ ...item, ...data } as CalendarEvent)
                : item
            );
          }

          return [...existing, data].sort(
            (left, right) =>
              new Date(left.start_at).getTime() -
              new Date(right.start_at).getTime()
          );
        });

        // Refresh the query cache after adding an event
        refresh();
        setPendingNewEvent(null);
        return data as CalendarEvent;
      } catch (error) {
        patchVisibleEvents([], { clearIds: [optimisticId] });
        throw error;
      }
    },
    [ws, readOnly, eventAdapter, patchVisibleEvents, queryClient, refresh]
  );

  const addEmptyEvent = useCallback(
    (date: Date, isAllDay?: boolean) => {
      // NOTE: This implementation uses createAllDayEvent helper for proper timezone handling
      // This ensures all-day events are created at midnight in the user's timezone rather than UTC
      // The workaround is necessary because dayjs timezone handling for all-day events can be inconsistent
      // across different browsers and timezone configurations
      const selectedDate = dayjs(date);

      let start_at: string;
      let end_at: string;

      if (isAllDay) {
        // Use the new createAllDayEvent helper for proper timezone handling
        const allDayTimes = createAllDayEvent(
          selectedDate.toDate(),
          undefined,
          1
        );
        start_at = allDayTimes.start_at;
        end_at = allDayTimes.end_at;
      } else {
        // Round to nearest 15-minute interval
        const startTime = roundToNearest15Minutes(selectedDate.toDate());
        const endTime = new Date(startTime);

        // Use default task duration of 60 minutes
        const defaultDuration = 60;
        endTime.setMinutes(endTime.getMinutes() + defaultDuration);

        start_at = startTime.toISOString();
        end_at = endTime.toISOString();
      }

      // Use default color
      const defaultColor = 'BLUE';

      // Create a new event with default values
      const newEvent: CalendarEvent = {
        id: 'new',
        title: '',
        description: '',
        start_at,
        end_at,
        color: defaultColor,
        ws_id: ws?.id || '',
      };

      if (eventAdapter) {
        eventAdapter.onCreateDraft?.(newEvent);
        eventAdapter.onOpen?.(undefined, newEvent);
        return newEvent as CalendarEvent;
      }

      // Store the pending new event
      setPendingNewEvent(newEvent);
      setActiveEventId('new');

      // Open the modal with the pending event
      setModalHidden(false);

      // Return the pending event object
      return newEvent as CalendarEvent;
    },
    [ws?.id, eventAdapter]
  );

  const addEmptyEventWithDuration = useCallback(
    (startDate: Date, endDate: Date) => {
      // Round start and end times to nearest 15-minute interval
      const roundedStartDate = roundToNearest15Minutes(startDate);
      const roundedEndDate = roundToNearest15Minutes(endDate);

      // Use default color
      const defaultColor = 'BLUE';

      // Create a new event with default values
      const newEvent: CalendarEvent = {
        id: 'new',
        title: '',
        description: '',
        start_at: roundedStartDate.toISOString(),
        end_at: roundedEndDate.toISOString(),
        color: defaultColor,
        ws_id: ws?.id || '',
      };

      if (eventAdapter) {
        eventAdapter.onCreateDraft?.(newEvent);
        eventAdapter.onOpen?.(undefined, newEvent);
        return newEvent as CalendarEvent;
      }

      // Store the pending new event
      setPendingNewEvent(newEvent);
      setActiveEventId('new');

      // Open the modal with the pending event
      setModalHidden(false);

      // Return the pending event object
      return newEvent as CalendarEvent;
    },
    [ws?.id, eventAdapter]
  );

  // Process the update queue
  const processUpdateQueue = useCallback(async () => {
    if (readOnly) {
      updateQueueRef.current = [];
      pendingUpdatesRef.current.clear();
      isProcessingQueueRef.current = false;
      return;
    }
    if (isProcessingQueueRef.current || updateQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;

    try {
      // Sort the queue by timestamp to process oldest updates first
      updateQueueRef.current.sort((a, b) => a._timestamp - b._timestamp);

      // Take the first item from the queue
      const update = updateQueueRef.current.shift();

      if (!update?._eventId) {
        isProcessingQueueRef.current = false;
        return;
      }

      const eventId = update._eventId;
      const {
        _updateId,
        _timestamp,
        _eventId,
        _previousEvent,
        _resolvers,
        ...updateData
      } = update;
      pendingUpdatesRef.current.delete(eventId);

      // Check if the event exists before trying to update
      const existingEvent =
        _previousEvent ?? events.find((e: CalendarEvent) => e.id === eventId);
      if (!existingEvent) {
        const errorMsg = `Event with ID ${eventId} not found in local events`;
        _resolvers?.forEach(({ reject }) => {
          reject(new Error(errorMsg));
        });
        return;
      }

      // Validate workspace ownership
      if (existingEvent.ws_id !== ws?.id) {
        const errorMsg = `Event ${eventId} does not belong to current workspace (${ws?.id})`;
        _resolvers?.forEach(({ reject }) => {
          reject(new Error(errorMsg));
        });
        return;
      }

      try {
        // Clean up the update data to ensure no undefined values and exclude system fields
        const cleanUpdateData: WorkspaceCalendarEventUpdatePayload = {
          ...(updateData.title !== undefined && { title: updateData.title }),
          ...(updateData.description !== undefined && {
            description: updateData.description,
          }),
          ...(updateData.start_at !== undefined && {
            start_at: updateData.start_at,
          }),
          ...(updateData.end_at !== undefined && { end_at: updateData.end_at }),
          ...(updateData.color !== undefined && { color: updateData.color }),
          ...(updateData.location !== undefined && {
            location: updateData.location,
          }),
          ...(updateData.locked !== undefined && { locked: updateData.locked }),
          ...(updateData.source !== undefined && { source: updateData.source }),
        };

        // ws is guaranteed to be defined here (validated above at line 732)
        const wsId = ws!.id;

        // The API response includes task_id from the database which is not in CalendarEvent type
        const data = (await updateWorkspaceCalendarEvent(
          wsId,
          eventId,
          cleanUpdateData,
          noStoreFetchOptions
        )) as CalendarEvent & { task_id?: string | null };
        const hasNewerPendingUpdate = pendingUpdatesRef.current.has(eventId);

        // If event times changed, sync task's total_duration
        if (data) {
          patchWorkspaceCalendarEventCache(queryClient, wsId, (existing) =>
            existing.map((event) =>
              event.id === eventId
                ? ({ ...event, ...data } as CalendarEvent)
                : event
            )
          );

          if (!hasNewerPendingUpdate) {
            patchVisibleEvents([data]);
          }
        }

        if (data && (cleanUpdateData.start_at || cleanUpdateData.end_at)) {
          const supabase = createClient();
          await syncTaskDurationAfterEventChange(
            supabase,
            eventId,
            {
              start_at: data.start_at,
              end_at: data.end_at,
              task_id: data.task_id,
            },
            { calendarWsId: wsId, isPersonalCalendar: !!ws?.personal }
          );
          invalidateTaskSchedulingQueries(queryClient, wsId);
          // Notify components to refresh server data
          onTaskScheduled?.();
        }

        // Refresh the query cache after updating an event
        refresh();

        if (data) {
          // Resolve the promise for this update
          _resolvers?.forEach(({ resolve }) => {
            resolve(data as CalendarEvent);
          });
        } else {
          _resolvers?.forEach(({ reject }) => {
            reject(
              new Error(`Failed to update event ${eventId} - no data returned`)
            );
          });
        }
      } catch (err) {
        if (!pendingUpdatesRef.current.has(eventId) && _previousEvent) {
          patchVisibleEvents([_previousEvent]);
        }
        _resolvers?.forEach(({ reject }) => {
          reject(err);
        });
      }
    } finally {
      isProcessingQueueRef.current = false;

      // Process the next item in the queue if there are any
      if (updateQueueRef.current.length > 0) {
        setTimeout(processUpdateQueue, 50); // Small delay to prevent blocking
      }
    }
  }, [
    refresh,
    events,
    ws,
    queryClient,
    onTaskScheduled,
    readOnly,
    patchVisibleEvents,
  ]);

  const updateEvent = useCallback(
    async (eventId: string, eventUpdates: Partial<CalendarEvent>) => {
      if (readOnly) {
        console.warn('Calendar is in read-only mode');
        return undefined;
      }

      // Clean and validate the event updates - only allow known CalendarEvent fields
      const allowedFields: (keyof CalendarEvent)[] = [
        'title',
        'description',
        'start_at',
        'end_at',
        'color',
        'location',
        'locked',
        'source',
      ];

      const cleanedUpdates: Partial<CalendarEvent> = {};
      for (const field of allowedFields) {
        if (eventUpdates[field] !== undefined) {
          (cleanedUpdates as any)[field] = eventUpdates[field];
        }
      }

      // Round start and end times to nearest 15-minute interval if they exist
      if (cleanedUpdates.start_at) {
        const startDate = roundToNearest15Minutes(
          new Date(cleanedUpdates.start_at)
        );
        cleanedUpdates.start_at = startDate.toISOString();
      }
      if (cleanedUpdates.end_at) {
        const endDate = roundToNearest15Minutes(
          new Date(cleanedUpdates.end_at)
        );
        cleanedUpdates.end_at = endDate.toISOString();
      }

      // If times were changed (moved/resized), mark as locked to preserve user preference
      // This ensures manually moved events won't be rescheduled by Smart Schedule
      if (cleanedUpdates.start_at || cleanedUpdates.end_at) {
        cleanedUpdates.locked = true;
      }

      if (eventAdapter?.onUpdate || eventAdapter?.onCreate) {
        if (pendingNewEvent && eventId === 'new') {
          const result = await addEvent({
            ...pendingNewEvent,
            ...cleanedUpdates,
          } as Omit<CalendarEvent, 'id'>);
          return result;
        }

        const existingEvent = events.find(
          (event: CalendarEvent) => event.id === eventId
        );
        const result = await eventAdapter.onUpdate?.(
          eventId,
          cleanedUpdates,
          existingEvent
        );
        refresh();
        return result;
      }

      if (!ws) throw new Error('No workspace selected');

      // If this is a newly created event that hasn't been saved to the database yet
      if (pendingNewEvent && eventId === 'new') {
        const newEventData = {
          ...pendingNewEvent,
          ...cleanedUpdates,
        };

        // Create a new event instead of updating
        const result = await addEvent(
          newEventData as Omit<CalendarEvent, 'id'>
        );
        return result;
      }

      const existingEvent = events.find(
        (event: CalendarEvent) => event.id === eventId
      );
      if (!existingEvent) {
        throw new Error(`Event with ID ${eventId} not found in local events`);
      }

      patchVisibleEvents(
        [
          {
            ...existingEvent,
            ...cleanedUpdates,
            _optimisticStatus: 'updating',
          } as CalendarEvent & { _optimisticStatus: 'updating' },
        ],
        { status: 'updating' }
      );

      // Generate a unique update ID to track this specific update request
      const updateId = `${eventId}-${Date.now()}`;
      const timestamp = Date.now();

      // Create a promise that will resolve when the update is actually performed
      return new Promise<CalendarEvent>((resolve, reject) => {
        const existingPending = pendingUpdatesRef.current.get(eventId);
        const resolvers = [
          ...(existingPending?._resolvers ?? []),
          { resolve, reject },
        ];

        // Create the update object with the promise callbacks
        const updateObject: PendingEventUpdate = {
          ...(existingPending ?? {}),
          ...cleanedUpdates,
          _updateId: updateId,
          _timestamp: timestamp,
          _eventId: eventId,
          _previousEvent: existingPending?._previousEvent ?? existingEvent,
          _resolvers: resolvers,
        };

        // Store the latest update for this event
        pendingUpdatesRef.current.set(eventId, updateObject);

        // Keep only the newest queued payload per event. Promise callers are
        // retained in _resolvers and settle from the single coalesced request.
        updateQueueRef.current = updateQueueRef.current.filter(
          (queuedUpdate) => queuedUpdate._eventId !== eventId
        );
        updateQueueRef.current.push(updateObject);

        // Clear any existing timer
        if (updateDebounceTimerRef.current) {
          clearTimeout(updateDebounceTimerRef.current);
        }

        // Start processing the queue after a short delay
        updateDebounceTimerRef.current = setTimeout(() => {
          updateDebounceTimerRef.current = null;
          processUpdateQueue();
        }, 250); // Reduced from 2000ms to 250ms for better responsiveness
      });
    },
    [
      ws,
      processUpdateQueue,
      pendingNewEvent,
      addEvent,
      events,
      readOnly,
      eventAdapter,
      refresh,
      patchVisibleEvents,
    ]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      if (readOnly) {
        console.warn('Calendar is in read-only mode');
        return;
      }
      // If this is a pending new event that hasn't been saved yet
      if (pendingNewEvent && eventId === 'new') {
        // Just clear the pending event
        setPendingNewEvent(null);
        setActiveEventId(null);
        setPreviewEventId(null);
        return;
      }

      if (eventAdapter?.onDelete) {
        await eventAdapter.onDelete(
          eventId,
          events.find((event: CalendarEvent) => event.id === eventId)
        );
        refresh();
        setActiveEventId(null);
        setPreviewEventId(null);
        return;
      }

      if (!ws) throw new Error('No workspace selected');

      const eventToDelete = events.find(
        (e: CalendarEvent) => e.id === eventId
      ) as (CalendarEvent & { task_id?: string | null }) | undefined;

      if (!ws?.id) {
        throw new Error('No workspace selected');
      }

      if (eventToDelete) {
        patchVisibleEvents([], { removeIds: [eventId] });
      }

      let deleteResult: {
        linkedTaskId?: string | null;
        skippedHabitId?: string | null;
      };

      try {
        deleteResult = await deleteWorkspaceCalendarEvent(
          ws.id,
          eventId,
          noStoreFetchOptions
        );
      } catch (error) {
        if (eventToDelete) {
          patchVisibleEvents([eventToDelete]);
        }
        throw error;
      }

      const hasLinkedTask =
        !!deleteResult.linkedTaskId || !!eventToDelete?.task_id;
      const hasLinkedHabit = !!deleteResult.skippedHabitId;

      patchWorkspaceCalendarEventCache(queryClient, ws.id, (existing) =>
        existing.filter((event) => event.id !== eventId)
      );

      // Refresh the query cache after deleting an event
      refresh();
      setActiveEventId(null);
      setPreviewEventId(null);

      // If this was a task-linked event, refresh task queries
      if (hasLinkedTask || hasLinkedHabit) {
        invalidateTaskSchedulingQueries(queryClient, ws.id);
        onTaskScheduled?.();
      }
    },
    [
      ws,
      refresh,
      pendingNewEvent,
      events,
      queryClient,
      onTaskScheduled,
      readOnly,
      eventAdapter,
      patchVisibleEvents,
    ]
  );

  const googleEvents = useMemo(() => [], []);
  const getGoogleEvents = useCallback(() => googleEvents, [googleEvents]);

  // Modal management
  const openEventEditor = useCallback(
    (eventId?: string, options?: { defaultNewEventTab?: 'manual' | 'ai' }) => {
      setPreviewEventId(null);

      if (eventAdapter?.onOpen) {
        if (eventId) {
          eventAdapter.onOpen(
            eventId,
            events.find((event: CalendarEvent) => event.id === eventId)
          );
          return;
        }

        setDefaultNewEventTab(options?.defaultNewEventTab ?? 'manual');

        const now = roundToNearest15Minutes(new Date());
        const oneHourLater = new Date(now);
        oneHourLater.setHours(oneHourLater.getHours() + 1);

        const newEvent: CalendarEvent = {
          id: 'new',
          title: '',
          description: '',
          start_at: now.toISOString(),
          end_at: oneHourLater.toISOString(),
          color: 'BLUE',
          ws_id: ws?.id || '',
        };

        eventAdapter.onCreateDraft?.(newEvent);
        eventAdapter.onOpen(undefined, newEvent);
        return;
      }

      if (eventId) {
        setActiveEventId(eventId);
        setPendingNewEvent(null);
        setModalHidden(false);
        return;
      }

      setDefaultNewEventTab(options?.defaultNewEventTab ?? 'manual');

      const now = roundToNearest15Minutes(new Date());
      const oneHourLater = new Date(now);
      oneHourLater.setHours(oneHourLater.getHours() + 1);

      const newEvent: Omit<CalendarEvent, 'id'> = {
        title: '',
        description: '',
        start_at: now.toISOString(),
        end_at: oneHourLater.toISOString(),
        color: 'BLUE',
        ws_id: ws?.id || '',
      };

      setPendingNewEvent(newEvent);
      setActiveEventId('new');
      setModalHidden(false);
    },
    [ws?.id, eventAdapter, events]
  );

  const openModal = useCallback(
    (
      eventId?: string,
      _modalType?: 'all-day' | 'event',
      options?: { defaultNewEventTab?: 'manual' | 'ai' }
    ) => {
      if (eventAdapter?.onOpen && eventId) {
        eventAdapter.onOpen(
          eventId,
          events.find((event: CalendarEvent) => event.id === eventId)
        );
        return;
      }

      if (eventId) {
        setPendingNewEvent(null);
        setActiveEventId(null);
        setPreviewEventId(eventId);
        return;
      }

      openEventEditor(undefined, options);
    },
    [openEventEditor, eventAdapter, events]
  );

  const closeModal = useCallback(() => {
    setActiveEventId(null);
    setPendingNewEvent(null);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewEventId(null);
  }, []);

  const activeEvent = useMemo(() => {
    // If it's a pending new event
    if (pendingNewEvent && activeEventId === 'new') {
      return {
        id: 'new', // Use 'new' as the ID for pending events
        ...pendingNewEvent,
      } as CalendarEvent;
    }

    // Otherwise try to find an existing event
    return activeEventId && activeEventId !== 'new'
      ? events.find((e: Partial<CalendarEvent>) => e.id === activeEventId)
      : undefined;
  }, [activeEventId, events, pendingNewEvent]);

  const previewEvent = useMemo(() => {
    return previewEventId
      ? events.find((e: Partial<CalendarEvent>) => e.id === previewEventId)
      : undefined;
  }, [events, previewEventId]);

  const isEditing = useCallback(() => !!activeEventId, [activeEventId]);
  const hideModal = useCallback(() => setModalHidden(true), []);
  const showModal = useCallback(() => setModalHidden(false), []);

  // Legacy support
  const getModalStatus = useCallback(
    (id: string) => (isModalHidden ? false : activeEventId === id),
    [isModalHidden, activeEventId]
  );

  const getActiveEvent = useCallback(
    () => (isModalHidden ? undefined : activeEvent),
    [isModalHidden, activeEvent]
  );

  const isModalActive = useCallback(
    () => (isModalHidden ? false : activeEventId !== null),
    [isModalHidden, activeEventId]
  );

  // Add this new function for manual Google Calendar sync
  const syncGoogleCalendarNow = useCallback(
    async (
      progressCallback?: (progress: {
        phase: 'fetch' | 'delete' | 'update' | 'insert' | 'complete';
        current: number;
        total: number;
        changesMade: boolean;
        statusMessage?: string;
      }) => void
    ) => {
      if (!ws?.id) {
        return false;
      }

      try {
        if (progressCallback) {
          progressCallback({
            phase: 'fetch',
            current: 0,
            total: 1,
            changesMade: false,
            statusMessage: 'Syncing connected calendars...',
          });
        }

        const response = await fetch(
          `/api/v1/workspaces/${ws.id}/calendar/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: 'inbound', source: 'manual' }),
          }
        );

        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error || 'Calendar sync failed');
        }

        const inserted =
          (result?.summary?.google?.inserted ?? 0) +
          (result?.summary?.microsoft?.inserted ?? 0);
        const updated =
          (result?.summary?.google?.updated ?? 0) +
          (result?.summary?.microsoft?.updated ?? 0);
        const deleted =
          (result?.summary?.google?.deleted ?? 0) +
          (result?.summary?.microsoft?.deleted ?? 0);
        const changesMade = inserted + updated + deleted > 0;

        await queryClient.invalidateQueries({
          queryKey: ['databaseCalendarEvents', ws.id],
          exact: false,
        });

        if (progressCallback) {
          progressCallback({
            phase: 'complete',
            current: 1,
            total: 1,
            changesMade,
            statusMessage: changesMade
              ? `Sync complete. ${inserted} added, ${updated} updated, ${deleted} removed.`
              : 'Sync complete. No changes needed.',
          });
        }

        return changesMade;
      } catch (_) {
        if (progressCallback) {
          progressCallback({
            phase: 'complete',
            current: 1,
            total: 1,
            changesMade: false,
            statusMessage: 'Sync failed. Please try again.',
          });
        }

        return false;
      }
    },
    [queryClient, ws?.id]
  );

  const [isDragging, setIsDragging] = useState(false);
  const [hoveredBaseEventId, setHoveredBaseEventId] = useState<string | null>(
    null
  );
  const [hoveredEventColumn, setHoveredEventColumn] = useState<number | null>(
    null
  );

  // Schedule a task as a calendar event (for drag-and-drop from sidebar)
  const scheduleTaskAsEvent = useCallback(
    async (
      taskId: string,
      startAt: Date,
      endAt: Date,
      taskData?: TaskDragData
    ) => {
      if (!ws?.id) {
        throw new Error('No workspace selected');
      }

      const supabase = createClient();

      // Calculate scheduled duration in hours
      const scheduledHours =
        (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user?.id) {
        throw authError ?? new Error('Not signed in');
      }

      const { data: existingSettings } = await (supabase as any)
        .from('task_user_scheduling_settings')
        .select('total_duration, calendar_hours')
        .eq('task_id', taskId)
        .eq('user_id', user.id)
        .maybeSingle();

      // Check if task has scheduling configured (has duration and calendar_hours)
      const hasSchedulingConfigured =
        existingSettings?.total_duration &&
        existingSettings.total_duration > 0 &&
        existingSettings?.calendar_hours;

      // Always enable auto_schedule when dragging to calendar.
      // Task scheduling settings are per-user regardless of calendar type.
      const updatePayload = hasSchedulingConfigured
        ? { auto_schedule: true }
        : {
            total_duration: scheduledHours,
            calendar_hours: 'personal_hours' as const,
            is_splittable: false,
            auto_schedule: true,
          };

      const { error: updateError } = await (supabase as any)
        .from('task_user_scheduling_settings')
        .upsert(
          {
            task_id: taskId,
            user_id: user.id,
            ...updatePayload,
          },
          { onConflict: 'task_id,user_id' }
        );
      if (updateError) {
        console.error('Failed to update task scheduling:', updateError);
      }

      // Map priority to color (priority can be string like 'critical', 'high', etc.)
      const priorityColorMap: Record<string, SupportedColor> = {
        critical: 'RED',
        high: 'ORANGE',
        normal: 'YELLOW',
        low: 'BLUE',
      };
      const priority = String(taskData?.priority ?? 'normal');
      const eventColor = priorityColorMap[priority] || 'BLUE';

      const event = await createWorkspaceCalendarEvent(
        ws.id,
        {
          title: taskData?.name || 'Task',
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          color: eventColor,
          locked: true,
          task_id: taskId,
        },
        {
          fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
        }
      );

      patchWorkspaceCalendarEventCache(queryClient, ws.id, (existing) => {
        if (existing.some((item) => item.id === event.id)) {
          return existing;
        }

        return [...existing, event].sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        );
      });

      if (event) {
        // Sync total_duration if total scheduled exceeds current duration
        // Use the new duration if we just set defaults, otherwise use existing
        const currentDuration = hasSchedulingConfigured
          ? existingSettings?.total_duration || 0
          : scheduledHours;

        const { data: scheduledEvents } = await supabase
          .from('workspace_calendar_events')
          .select('start_at, end_at')
          .eq('task_id', taskId)
          .eq('ws_id', ws.id);

        const totalScheduledMinutes = (scheduledEvents || []).reduce(
          (sum: number, scheduledEvent: { start_at: string; end_at: string }) =>
            sum +
            Math.round(
              (new Date(scheduledEvent.end_at).getTime() -
                new Date(scheduledEvent.start_at).getTime()) /
                60000
            ),
          0
        );
        const totalScheduledHours = totalScheduledMinutes / 60;

        // If scheduled exceeds current duration, update per-user duration.
        if (totalScheduledHours > currentDuration) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            const { error: updateError } = await (supabase as any)
              .from('task_user_scheduling_settings')
              .upsert(
                {
                  task_id: taskId,
                  user_id: user.id,
                  total_duration: totalScheduledHours,
                },
                { onConflict: 'task_id,user_id' }
              );
            if (updateError) {
              console.error('Failed to update task duration:', updateError);
            }
          }
        }
      }

      // Refresh queries
      refresh();
      // Invalidate all task-related queries to ensure UI updates
      invalidateTaskSchedulingQueries(queryClient, ws.id);

      // Call the callback to notify components (e.g., for server data refresh)
      onTaskScheduled?.();
    },
    [ws?.id, refresh, queryClient, onTaskScheduled]
  );

  const values = {
    getEvent,
    getCurrentEvents,
    getUpcomingEvent,
    getEvents,
    getGoogleEvents,
    getEventLevel,

    addEvent,
    addEmptyEvent,
    addEmptyEventWithDuration,
    updateEvent,
    deleteEvent,

    // New API
    isModalOpen: !isModalHidden && activeEventId !== null,
    activeEvent,
    isPreviewOpen: !!previewEvent,
    previewEvent,
    openModal,
    openEventEditor,
    closePreview,
    closeModal,

    // Legacy API
    getModalStatus,
    getActiveEvent,
    isModalActive,
    isEditing,
    hideModal,
    showModal,

    // Google Calendar API
    syncGoogleCalendarNow,

    isDragging,
    setIsDragging,
    hoveredBaseEventId,
    setHoveredBaseEventId,
    hoveredEventColumn,
    setHoveredEventColumn,
    // Task scheduling
    scheduleTaskAsEvent,
    onTaskScheduled,
    setOnTaskScheduled,
    // Preview events
    previewEvents,
    setPreviewEvents,
    clearPreviewEvents,
    // Affected events
    affectedEventIds,
    setAffectedEventIds,
    clearAffectedEventIds,
    // Hide non-preview events
    hideNonPreviewEvents,
    setHideNonPreviewEvents,
    defaultNewEventTab,
    disableBuiltInEventUi: eventAdapter?.disableBuiltInEventUi ?? false,
    preservePastEventOpacity: eventAdapter?.preservePastEventOpacity ?? false,
    renderEventContextMenu: eventAdapter?.renderContextMenu,
    isEventReadOnly: eventAdapter?.isEventReadOnly ?? (() => false),
    readOnly,
  };

  // Clean up any pending updates when component unmounts
  useEffect(() => {
    return () => {
      if (updateDebounceTimerRef.current) {
        clearTimeout(updateDebounceTimerRef.current);
      }

      // Clear the update queue
      updateQueueRef.current = [];
      pendingUpdatesRef.current.clear();
    };
  }, []);

  return (
    <CalendarContext.Provider value={values}>
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = () => {
  const context = useContext(CalendarContext);
  if (context === undefined)
    throw new Error('useCalendar() must be used within a CalendarProvider.');
  return context;
};
