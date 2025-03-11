import { createClient } from '@tuturuuu/supabase/next/client';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import moment from 'moment';
import 'moment/locale/vi';
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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

// Updated context with improved type definitions
const CalendarContext = createContext<{
  getEvent: (eventId: string) => CalendarEvent | undefined;
  getCurrentEvents: (date?: Date) => CalendarEvent[];
  getUpcomingEvent: () => CalendarEvent | undefined;
  getEvents: () => CalendarEvent[];
  getEventLevel: (eventId: string) => number;
  addEvent: (event: Omit<CalendarEvent, 'id'>) => Promise<CalendarEvent>;
  addEmptyEvent: (date: Date) => CalendarEvent;
  updateEvent: (
    eventId: string,
    data: Partial<CalendarEvent>
  ) => Promise<CalendarEvent>;
  deleteEvent: (eventId: string) => Promise<void>;
  isModalOpen: boolean;
  activeEvent: CalendarEvent | undefined;
  openModal: (eventId?: string) => void;
  closeModal: () => void;
  isEditing: () => boolean;
  hideModal: () => void;
  showModal: () => void;
  getModalStatus: (id: string) => boolean;
  getActiveEvent: () => CalendarEvent | undefined;
  isModalActive: () => boolean;
}>({
  getEvent: () => undefined,
  getCurrentEvents: () => [],
  getUpcomingEvent: () => undefined,
  getEvents: () => [],
  getEventLevel: () => 0,
  addEvent: () => Promise.resolve({} as CalendarEvent),
  addEmptyEvent: () => ({}) as CalendarEvent,
  updateEvent: () => Promise.resolve({} as CalendarEvent),
  deleteEvent: () => Promise.resolve(),
  isModalOpen: false,
  activeEvent: undefined,
  openModal: () => undefined,
  closeModal: () => undefined,
  isEditing: () => false,
  hideModal: () => undefined,
  showModal: () => undefined,
  getModalStatus: () => false,
  getActiveEvent: () => undefined,
  isModalActive: () => false,
});

// Add this interface before the updateEvent function
interface PendingEventUpdate extends Partial<CalendarEvent> {
  _updateId?: string;
  _timestamp: number;
  _eventId: string;
  _resolve?: (value: CalendarEvent) => void;
  _reject?: (reason: any) => void;
}

export const CalendarProvider = ({
  ws,
  useQuery,
  useQueryClient,
  children,
}: {
  ws?: Workspace;
  useQuery: any;
  useQueryClient: any;
  children: ReactNode;
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

  const getDateRangeQuery = ({
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  }) => {
    return `?start_at=${startDate.toISOString()}&end_at=${endDate.toISOString()}`;
  };

  // Extended date range to fetch events for a wider range
  // This ensures we get events that might start before the current month but extend into it
  const startOfRange = new Date();
  startOfRange.setDate(1); // First day of current month
  startOfRange.setMonth(startOfRange.getMonth() - 1); // Go back one month
  startOfRange.setHours(0, 0, 0, 0);

  const endOfRange = new Date();
  endOfRange.setMonth(endOfRange.getMonth() + 2); // Go forward two months
  endOfRange.setDate(0); // Last day of that month
  endOfRange.setHours(23, 59, 59, 999);

  // Define an async function to fetch the calendar events
  const fetchCalendarEvents = async () => {
    if (!ws?.id) return { data: [], count: 0 };

    const dateRangeQuery = getDateRangeQuery({
      startDate: startOfRange,
      endDate: endOfRange,
    });

    const response = await fetch(
      `/api/v1/workspaces/${ws.id}/calendar/events${dateRangeQuery}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch calendar events');
    }

    return await response.json();
  };

  // Use React Query to fetch and cache the events
  const { data } = useQuery({
    queryKey: [
      'calendarEvents',
      ws?.id,
      startOfRange.toISOString(),
      endOfRange.toISOString(),
    ],
    queryFn: fetchCalendarEvents,
    enabled: !!ws?.id,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
  });

  const events = useMemo(() => data?.data ?? [], [data]);

  // Invalidate and refetch events
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['calendarEvents', ws?.id],
    });
  }, [queryClient, ws?.id]);

  // Modal state
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [isModalHidden, setModalHidden] = useState(false);
  const [pendingNewEvent, setPendingNewEvent] =
    useState<Partial<CalendarEvent> | null>(null);

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

        // Check if the target date falls within the event's date range
        return eventStartDay <= targetDay && eventEndDay >= targetDay;
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

  const getEvents = useCallback(() => events, [events]);

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
      );
      return Math.max(...prevEventLevels) + 1;
    },
    [events]
  );

  // CRUD operations with Supabase
  const addEvent = useCallback(
    async (event: Omit<CalendarEvent, 'id'>) => {
      if (!ws) throw new Error('No workspace selected');

      try {
        const supabase = createClient();

        // Round start and end times to nearest 15-minute interval
        const startDate = roundToNearest15Minutes(new Date(event.start_at));
        const endDate = roundToNearest15Minutes(new Date(event.end_at));

        const { data, error } = await supabase
          .from('workspace_calendar_events')
          .insert({
            title: event.title || '',
            description: event.description || '',
            start_at: startDate.toISOString(),
            end_at: endDate.toISOString(),
            color: (event.color || 'BLUE') as SupportedColor,
            // location: event.location || '',
            // is_all_day: event.is_all_day || false,
            // scheduling_note: event.scheduling_note || '',
            // priority: event.priority || 'medium',
            ws_id: ws.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Refresh the query cache after adding an event
        refresh();

        if (data) {
          // Clear any pending new event
          setPendingNewEvent(null);
          return data as CalendarEvent;
        }

        return {} as CalendarEvent;
      } catch (err) {
        console.error('Failed to add event:', err);
        throw err;
      }
    },
    [ws, refresh]
  );

  const addEmptyEvent = useCallback(
    (date: Date) => {
      // TODO: Fix this weird workaround in the future
      const selectedDate = dayjs(date);
      const correctDate = selectedDate.add(1, 'day');

      // Round to nearest 15-minute interval
      const start_at = roundToNearest15Minutes(correctDate.toDate());
      const end_at = new Date(start_at);
      end_at.setHours(end_at.getHours() + 1);

      // Create a new event with default values
      const newEvent: Omit<CalendarEvent, 'id'> = {
        title: '',
        description: '',
        start_at: start_at.toISOString(),
        end_at: end_at.toISOString(),
        color: 'BLUE',
        ws_id: ws?.id || '',
      };

      // Store the pending new event
      setPendingNewEvent(newEvent);
      setActiveEventId('new');

      // Open the modal with the pending event
      setModalHidden(false);

      // Return the pending event object
      return newEvent as CalendarEvent;
    },
    [ws?.id]
  );

  // Process the update queue
  const processUpdateQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || updateQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;

    try {
      // Sort the queue by timestamp to process oldest updates first
      updateQueueRef.current.sort((a, b) => a._timestamp - b._timestamp);

      // Take the first item from the queue
      const update = updateQueueRef.current.shift();

      if (!update || !update._eventId) {
        isProcessingQueueRef.current = false;
        return;
      }

      const eventId = update._eventId;
      const {
        _updateId,
        _timestamp,
        _eventId,
        _resolve,
        _reject,
        ...updateData
      } = update;

      try {
        // Perform the actual update
        const supabase = createClient();
        const { data, error } = await supabase
          .from('workspace_calendar_events')
          .update({
            title: updateData.title,
            description: updateData.description,
            start_at: updateData.start_at,
            end_at: updateData.end_at,
            color: updateData.color,
            // location: updateData.location,
            // is_all_day: updateData.is_all_day,
            // scheduling_note: updateData.scheduling_note,
            // priority: updateData.priority,
          })
          .eq('id', eventId)
          .select()
          .single();

        if (error) throw error;

        // Refresh the query cache after updating an event
        refresh();

        if (data) {
          // Resolve the promise for this update
          if (_resolve) {
            _resolve(data as CalendarEvent);
          }
        } else {
          if (_reject) {
            _reject(new Error(`Failed to update event ${eventId}`));
          }
        }
      } catch (err) {
        console.error(`Failed to update event ${eventId}:`, err);
        if (_reject) {
          _reject(err);
        }
      }
    } finally {
      isProcessingQueueRef.current = false;

      // Process the next item in the queue if there are any
      if (updateQueueRef.current.length > 0) {
        setTimeout(processUpdateQueue, 50); // Small delay to prevent blocking
      }
    }
  }, [refresh]);

  const updateEvent = useCallback(
    async (eventId: string, eventUpdates: Partial<CalendarEvent>) => {
      if (!ws) throw new Error('No workspace selected');

      // Round start and end times to nearest 15-minute interval if they exist
      const updatedEvent = { ...eventUpdates };
      if (updatedEvent.start_at) {
        const startDate = roundToNearest15Minutes(
          new Date(updatedEvent.start_at)
        );
        updatedEvent.start_at = startDate.toISOString();
      }
      if (updatedEvent.end_at) {
        const endDate = roundToNearest15Minutes(new Date(updatedEvent.end_at));
        updatedEvent.end_at = endDate.toISOString();
      }

      // If this is a newly created event that hasn't been saved to the database yet
      if (pendingNewEvent && eventId === 'new') {
        const newEventData = {
          ...pendingNewEvent,
          ...updatedEvent,
        };

        try {
          // Create a new event instead of updating
          const result = await addEvent(
            newEventData as Omit<CalendarEvent, 'id'>
          );
          return result;
        } catch (err) {
          console.error('Failed to create new event:', err);
          throw err;
        }
      }

      // Generate a unique update ID to track this specific update request
      const updateId = `${eventId}-${Date.now()}`;
      const timestamp = Date.now();

      // Create a promise that will resolve when the update is actually performed
      return new Promise<CalendarEvent>((resolve, reject) => {
        // Create the update object with the promise callbacks
        const updateObject: PendingEventUpdate = {
          ...updatedEvent,
          _updateId: updateId,
          _timestamp: timestamp,
          _eventId: eventId,
          _resolve: resolve,
          _reject: reject,
        };

        // Store the latest update for this event
        pendingUpdatesRef.current.set(eventId, updateObject);

        // Add to the queue
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
    [ws, processUpdateQueue, pendingNewEvent, addEvent]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      // If this is a pending new event that hasn't been saved yet
      if (pendingNewEvent && eventId === 'new') {
        // Just clear the pending event
        setPendingNewEvent(null);
        setActiveEventId(null);
        return;
      }

      if (!ws) throw new Error('No workspace selected');

      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('workspace_calendar_events')
          .delete()
          .eq('id', eventId);

        if (error) throw error;

        // Refresh the query cache after deleting an event
        refresh();

        setActiveEventId(null);
      } catch (err) {
        console.error(`Failed to delete event ${eventId}:`, err);
        throw err;
      }
    },
    [ws, refresh, pendingNewEvent]
  );

  // Modal management
  const openModal = useCallback((eventId?: string) => {
    if (eventId) {
      // Opening an existing event
      setActiveEventId(eventId);
      setPendingNewEvent(null);
    } else {
      // Creating a new event
      const now = roundToNearest15Minutes(new Date());
      const oneHourLater = new Date(now);
      oneHourLater.setHours(oneHourLater.getHours() + 1);

      // Create a pending new event
      const newEvent: Omit<CalendarEvent, 'id'> = {
        title: '',
        description: '',
        start_at: now.toISOString(),
        end_at: oneHourLater.toISOString(),
        color: 'BLUE',
      };

      setPendingNewEvent(newEvent);
      setActiveEventId('new');
    }
    setModalHidden(false);
  }, []);

  const closeModal = useCallback(() => {
    setActiveEventId(null);
    setPendingNewEvent(null);
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

  const values = {
    getEvent,
    getCurrentEvents,
    getUpcomingEvent,
    getEvents,
    getEventLevel,

    addEvent,
    addEmptyEvent,
    updateEvent,
    deleteEvent,

    // New API
    isModalOpen: !isModalHidden && activeEventId !== null,
    activeEvent,
    openModal,
    closeModal,

    // Legacy API
    getModalStatus,
    getActiveEvent,
    isModalActive,
    isEditing,
    hideModal,
    showModal,
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
