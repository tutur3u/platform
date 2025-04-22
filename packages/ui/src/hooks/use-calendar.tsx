import { createClient } from '@tuturuuu/supabase/next/client';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { CalendarEvent, EventPriority } from '@tuturuuu/types/primitives/calendar-event';
import {
  CalendarSettings,
  defaultCalendarSettings,
} from '@tuturuuu/ui/legacy/calendar/settings/CalendarSettingsContext';
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
  // google calendar API
  syncWithGoogleCalendar: (event: CalendarEvent) => Promise<void>;
  syncAllFromGoogleCalendar: () => Promise<void>;
  // AI scheduling
  rescheduleEvents: (startDate?: Date, endDate?: Date, viewMode?: 'day' | '4-days' | 'week' | 'month') => Promise<CalendarEvent[] | undefined>;

  settings: CalendarSettings;
  updateSettings: (settings: Partial<CalendarSettings>) => void;
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
  // Google Calendar API
  syncWithGoogleCalendar: () => Promise.resolve(),
  syncAllFromGoogleCalendar: () => Promise.resolve(),
  // AI scheduling
  rescheduleEvents: () => Promise.resolve(undefined),

  settings: defaultCalendarSettings,
  updateSettings: () => undefined,
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
  initialSettings,
  enableExperimentalGoogleCalendar = false,
}: {
  ws?: Workspace;
  useQuery: any;
  useQueryClient: any;
  children: ReactNode;
  initialSettings?: Partial<CalendarSettings>;
  enableExperimentalGoogleCalendar?: boolean;
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

  // Load settings from localStorage if available
  const loadSettingsFromStorage = useCallback(() => {
    try {
      const storedSettings = localStorage.getItem('calendarSettings');
      if (storedSettings) {
        return JSON.parse(storedSettings) as CalendarSettings;
      }
    } catch (error) {
      console.error(
        'Failed to load calendar settings from localStorage:',
        error
      );
    }
    return null;
  }, []);

  // Calendar settings state
  const [settings, setSettings] = useState<CalendarSettings>(() => {
    const storedSettings = loadSettingsFromStorage();
    return {
      ...defaultCalendarSettings,
      ...(storedSettings || {}),
      ...initialSettings,
    };
  });

  // Save settings to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('calendarSettings', JSON.stringify(settings));
      console.log('Saved settings to localStorage:', settings);
    } catch (error) {
      console.error('Failed to save calendar settings to localStorage:', error);
    }
  }, [settings]);

  // Update settings function
  const updateSettings = useCallback(
    (newSettings: Partial<CalendarSettings>) => {
      console.log('Updating settings:', newSettings);
      setSettings((prev) => ({
        ...prev,
        ...newSettings,
      }));
    },
    []
  );

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

        let eventColor = event.color || 'BLUE';

        const { data, error } = await supabase
          .from('workspace_calendar_events')
          .insert({
            title: event.title || '',
            description: event.description || '',
            start_at: startDate.toISOString(),
            end_at: endDate.toISOString(),
            color: eventColor as SupportedColor,
            location: event.location || '',
            priority: event.priority || 'medium',
            ws_id: ws.id,
            locked: false,
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
    [ws, refresh, settings.categoryColors]
  );

  const addEmptyEvent = useCallback(
    (date: Date) => {
      // TOD0: Fix this weird workaround in the future
      const selectedDate = dayjs(date);
      const correctDate = selectedDate.add(1, 'day');

      // Round to nearest 15-minute interval
      const start_at = roundToNearest15Minutes(correctDate.toDate());
      const end_at = new Date(start_at);

      // Use default task duration from settings if available
      const defaultDuration = settings.taskSettings.defaultTaskDuration || 60;
      end_at.setMinutes(end_at.getMinutes() + defaultDuration);

      // Use default color from settings
      const defaultColor =
        settings.categoryColors.categories[0]?.color || 'BLUE';

      // Create a new event with default values
      const newEvent: CalendarEvent = {
        id: 'new',
        title: '',
        description: '',
        start_at: start_at.toISOString(),
        end_at: end_at.toISOString(),
        color: defaultColor,
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
    [ws?.id, settings.taskSettings, settings.categoryColors]
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
            location: updateData.location,
            priority: updateData.priority,
            locked: updateData.locked,
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
      console.log('Current events array:', events);
      console.log('Deleting event with ID:', eventId);
      // If this is a pending new event that hasn't been saved yet
      if (pendingNewEvent && eventId === 'new') {
        // Just clear the pending event
        setPendingNewEvent(null);
        setActiveEventId(null);
        return;
      }

      if (!ws) throw new Error('No workspace selected');

      // Find the event first to get the Google Calendar ID
      const eventToDelete = events.find((e: CalendarEvent) => e.id === eventId);
      const googleCalendarEventId = eventToDelete?.google_event_id;

      // --- Google Calendar Sync (Delete) ---
      if (googleCalendarEventId && enableExperimentalGoogleCalendar) {
        // Check if ID exists and feature enabled
        try {
          const syncResponse = await fetch('/api/v1/calendar/auth/sync', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ googleCalendarEventId }),
          });

          if (!syncResponse.ok) {
            const errorData = await syncResponse.json();
            if (errorData.eventNotFound) {
              console.warn(
                `Google event ${googleCalendarEventId} not found during delete sync. Proceeding with local delete.`
              );
              // Don't throw, just log. The event is gone from Google anyway.
            } else if (errorData.needsReAuth) {
              console.error(
                'Google token needs refresh/re-auth during delete.'
              );
              // TOD0: Notify user to re-authenticate. Should we block local delete? Maybe not.
            } else {
              // Throw an error to potentially stop the local delete or notify user
              throw new Error(
                `Google Calendar sync (DELETE) failed: ${syncResponse.statusText} - ${JSON.stringify(errorData)}`
              );
            }
          } else {
            console.log(
              `Google Calendar event ${googleCalendarEventId} deleted via sync.`
            );
          }
        } catch (syncError) {
          console.error(
            `Failed to sync delete with Google Calendar for event ${eventId}:`,
            syncError
          );
        }
      } else if (enableExperimentalGoogleCalendar && !googleCalendarEventId) {
        console.log(
          `Event ${eventId} has no Google Calendar ID, skipping delete sync.`
        );
      }

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

  const syncAllFromGoogleCalendar = useCallback(async () => {
    if (!enableExperimentalGoogleCalendar || !ws?.id) {
      console.log('Google Calendar sync disabled or no workspace selected');
      return;
    }

    try {
      // get all events from Google Calendar
      const response = await fetch('/api/v1/calendar/auth/fetch', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to fetch Google Calendar events'
        );
      }

      const { events: googleEvents } = await response.json();

      // get existing events from Supabase
      const supabase = createClient();
      const { data: localEvents, error: localEventsError } = await supabase
        .from('workspace_calendar_events')
        .select('id, google_event_id')
        .eq('ws_id', ws.id);

      if (localEventsError) {
        throw new Error('Failed to fetch local events');
      }

      // create a set of existing Google event IDs from Supabase
      const localGoogleEventIds = new Set(
        localEvents
          .filter((e: any) => e.google_event_id)
          .map((e: any) => e.google_event_id)
      );

      // filter out events that already exist in Supabase
      const newEvents = googleEvents.filter(
        (event: any) => !localGoogleEventIds.has(event.google_event_id)
      );

      // create a new event in Supabase for each new Google Calendar event
      for (const event of newEvents) {
        const { error: insertError } = await supabase
          .from('workspace_calendar_events')
          .insert({
            title: event.title,
            description: event.description,
            start_at: event.start_at,
            end_at: event.end_at,
            color: event.color,
            location: event.location,
            ws_id: ws.id,
            google_event_id: event.google_event_id,
            locked: event.locked || false,
            priority: event.priority || 'medium',
          });

        if (insertError) {
          console.error('Failed to insert event:', insertError);
          continue; // continue to the next event on error
        }
      }

      console.log(`Synced ${newEvents.length} new events from Google Calendar`);
      refresh();
    } catch (error) {
      console.error('Failed to sync all events from Google Calendar:', error);
      throw error;
    }
  }, [enableExperimentalGoogleCalendar, ws?.id, refresh]);

  // Google Calendar sync moved to API Route
  const syncWithGoogleCalendar = useCallback(
    async (event: CalendarEvent) => {
      if (!enableExperimentalGoogleCalendar) {
        return;
      }

      try {
        let response;
        if (event.google_event_id) {
          // Update an existing event on Google Calendar
          response = await fetch('/api/v1/calendar/auth/sync', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventId: event.id,
              googleCalendarEventId: event.google_event_id,
              eventUpdates: {
                title: event.title,
                description: event.description,
                start_at: event.start_at,
                end_at: event.end_at,
                color: event.color,
                location: event.location,
                priority: event.priority,
              },
            }),
          });
        } else {
          // create a new event on Google Calendar
          response = await fetch('/api/v1/calendar/auth/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event }),
          });
        }

        if (!response.ok) {
          const errorData = await response.json();
          if (errorData.needsReAuth) {
            console.error('Google token needs refresh/re-auth.');
            throw new Error('Google token invalid, please re-authenticate.');
          } else if (errorData.eventNotFound) {
            console.warn('Event not found on Google Calendar.');
            // Handle the case where the event is not found
          } else {
            throw new Error(
              errorData.error || 'Failed to sync with Google Calendar'
            );
          }
        }

        console.log('Event synced with Google Calendar');
        refresh();
      } catch (error) {
        console.error('Failed to sync with Google Calendar:', error);
        throw error;
      }
    },
    [enableExperimentalGoogleCalendar, refresh]
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

  // Helper function to detect overlap between events
  const eventsOverlap = (event1: CalendarEvent, event2: CalendarEvent) => {
    const event1Start = new Date(event1.start_at).getTime();
    const event1End = new Date(event1.end_at).getTime();
    const event2Start = new Date(event2.start_at).getTime();
    const event2End = new Date(event2.end_at).getTime();

    return event1Start < event2End && event1End > event2Start;
  };

  // New function for AI rescheduling of week events
  const rescheduleEvents = useCallback(async (startDate?: Date, endDate?: Date, viewMode: 'day' | '4-days' | 'week' | 'month' = 'week') => {
    if (!ws?.id) return;
    
    // Determine the time period based on the view mode
    let periodStart: Date;
    let periodEnd: Date;
    
    if (startDate && endDate) {
      // If specific start and end dates are provided, use them
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
    } else {
      // If no specific start and end dates, create a time period based on the current date and view mode
      const currentDate = new Date();
      
      if (viewMode === 'day') {
        // Day view: get today
        periodStart = new Date(currentDate);
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(currentDate);
        periodEnd.setHours(23, 59, 59, 999);
      } 
      else if (viewMode === '4-days') {
        // 4 days view: from today to 3 days after
        periodStart = new Date(currentDate);
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(currentDate);
        periodEnd.setDate(periodEnd.getDate() + 3);
        periodEnd.setHours(23, 59, 59, 999);
      }
      else if (viewMode === 'week') {
        // Week view: get 7 days from the start of the week
        periodStart = new Date(currentDate);
        periodStart.setDate(currentDate.getDate() - currentDate.getDay()); // Set to Sunday
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 6); // Tới thứ 7
        periodEnd.setHours(23, 59, 59, 999);
      }
      else if (viewMode === 'month') {
        // Month view: get the entire month
        periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        periodEnd.setHours(23, 59, 59, 999);
      }
      else {
        // Set the default to week
        periodStart = new Date(currentDate);
        periodStart.setDate(currentDate.getDate() - currentDate.getDay());
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 6);
        periodEnd.setHours(23, 59, 59, 999);
      }
    }
    
    console.log(`Rescheduling events for period: ${viewMode}`, {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString()
    });
    
    // Get all events in the selected time period
    const allEvents = events.filter((event: CalendarEvent) => {
      const eventStart = new Date(event.start_at);
      const eventEnd = new Date(event.end_at);
      
      // Check if the event is within the time period
      return (
        (eventStart >= periodStart && eventStart <= periodEnd) || // Start within the period
        (eventEnd >= periodStart && eventEnd <= periodEnd) || // End within the period
        (eventStart <= periodStart && eventEnd >= periodEnd) // Extend through the entire period
      );
    });
    
    console.log(`Found ${allEvents.length} events in the selected period`);
    
    // Sort by priority (high first, medium second, low last) và loại các event đã locked
    console.log('Sorting events by priority before scheduling...');
    
    // First, make sure we only schedule unlocked events
    const fixedEvents = allEvents.filter(
      (event: CalendarEvent) => event.locked
    );
    
    // Events that can be rescheduled (all non-locked events)
    const rescheduleableEvents = allEvents.filter(
      (event: CalendarEvent) => !event.locked
    );
    
    // Seperating events by priority
    const highPriorityEvents = rescheduleableEvents.filter(
      (event: CalendarEvent) => event.priority === 'high'
    );
    
    const mediumPriorityEvents = rescheduleableEvents.filter(
      (event: CalendarEvent) => event.priority === 'medium' || event.priority === undefined
    );
    
    const lowPriorityEvents = rescheduleableEvents.filter(
      (event: CalendarEvent) => event.priority === 'low'
    );
    
    console.log(`Claasified event by priority : High: ${highPriorityEvents.length}, Medium: ${mediumPriorityEvents.length}, Low: ${lowPriorityEvents.length}`);
    
    // Array containing the rescheduled events
    const rescheduledEvents: CalendarEvent[] = [...fixedEvents];
    
    // Define CategoryTimeWindow type
    interface CategoryTimeWindow {
      startHour: number;
      endHour: number;
      optimalHours: number[];
      preferredDays: string[];
    }
    
    // Define the type for time windows
    interface TimeWindows {
      [category: string]: CategoryTimeWindow;
    }

    // Make sure default time window is always available
    const DEFAULT_TIME_WINDOW: CategoryTimeWindow = {
      startHour: 9,
      endHour: 17,
      optimalHours: [9, 10, 11, 14, 15, 16],
      preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    };
    
    // Define default time windows for different categories when user settings not available
    const defaultTimeWindows: TimeWindows = {
      // Work: Prefer working hours, with focus time in morning
      'Work': {
        startHour: 9,  // 9am
        endHour: 17,   // 5pm
        optimalHours: [9, 10, 11, 14, 15, 16], // 9-11am, 2-4pm are optimal
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      // Health: Early morning is best for exercise/health activities
      'Health': {
        startHour: 6,  // 6am
        endHour: 10,   // 10am
        optimalHours: [6, 7, 8], // 6-8am is optimal
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      // Social: Evenings work best
      'Social': {
        startHour: 17, // 5pm
        endHour: 22,   // 10pm
        optimalHours: [18, 19, 20], // 6-8pm is optimal
        preferredDays: ['friday', 'saturday', 'sunday']
      },
      // Family: Evenings and weekends
      'Family': {
        startHour: 17, // 5pm
        endHour: 22,   // 10pm 
        optimalHours: [18, 19, 20], // 6-8pm is optimal
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      // Education: Mornings and early afternoons
      'Education': {
        startHour: 9,  // 9am
        endHour: 16,   // 4pm
        optimalHours: [9, 10, 11, 14], // 9-11am, 2pm are optimal
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      // Personal: Flexible, but avoid peak work hours
      'Personal': {
        startHour: 7,  // 7am
        endHour: 22,   // 10pm
        optimalHours: [7, 8, 12, 13, 17, 18, 19, 20], // Early morning, lunch, evening
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      // Default: Standard working hours
      'default': {
        startHour: 9,  // 9am
        endHour: 17,   // 5pm
        optimalHours: [9, 10, 11, 14, 15, 16], // 9-11am, 2-4pm are optimal
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      }
    };
    
    // Get custom time windows from user settings if available
    const userCategoryTimeSettings = settings?.smartScheduling?.categoryTimeSettings || {};
    
    // Combine user settings with default ones
    const timeWindows: TimeWindows = { ...defaultTimeWindows };
    
    // Override with user settings where available
    if (Object.keys(userCategoryTimeSettings).length > 0) {
      console.log('Using custom category time settings:', userCategoryTimeSettings);
      
      // Add user-defined categories to our timeWindows
      Object.entries(userCategoryTimeSettings).forEach(([category, settings]) => {
        timeWindows[category] = {
          startHour: settings.startHour,
          endHour: settings.endHour,
          optimalHours: settings.optimalHours,
          preferredDays: settings.preferredDays
        };
      });
    }
    
    // Ensure default is in timeWindows
    timeWindows['default'] = timeWindows['default'] || DEFAULT_TIME_WINDOW;
    
    // Function to detect category of an event
    const getEventCategory = (event: CalendarEvent): string => {
      // Check if category is in metadata
      if (event.metadata && typeof event.metadata === 'object' && 'category' in event.metadata) {
        return event.metadata.category as string;
      }
      
      // Try to determine by color if settings available
      if (settings?.categoryColors?.categories) {
        const matchingCategory = settings.categoryColors.categories.find(
          cat => cat.color === event.color
        );
        if (matchingCategory) {
          return matchingCategory.name;
        }
      }
      
      // Combine title and description for better analysis
      const title = event.title?.toLowerCase() || '';
      const description = event.description?.toLowerCase() || '';
      const combinedText = title + ' ' + description;
      
      // Try to determine from title and description with expanded keywords
      if (/work|meet(ing)?|job|project|client|report|present(ation)?|interview|deadline|task|conf(erence)?|workshop|office|business|colleague|work ?shop|planning|review/i.test(combinedText)) {
        return 'Work';
      } else if (/health|workout|gym|doctor|dentist|therapy|yoga|exercise|med(ication)?|wellness|fitness|medical|run(ning)?|swim(ming)?|train(ing)?|jog(ging)?|diet|nutrition|hospital|clinic|checkup|appointment/i.test(combinedText)) {
        return 'Health';
      } else if (/family|kid|child(ren)?|parent|spouse|husband|wife|son|daughter|mom|dad|brother|sister|grandpa|grandma|birthday|anniversary|relative|marriage|wedding/i.test(combinedText)) {
        return 'Family';
      } else if (/social|friend|party|lunch|dinner|coffee|drink|hangout|date|network(ing)?|meetup|gather(ing)?|club|bar|restaurant|cafe|happy hour|brunch/i.test(combinedText)) {
        return 'Social';
      } else if (/edu(cation)?|class|course|study|learn|lecture|school|college|university|homework|assignment|training|read(ing)?|book|essay|paper|research|seminar|webinar|tutorial/i.test(combinedText)) {
        return 'Education';
      } else if (/personal|hobby|shop(ping)?|errand|appointment|rest|break|recreation|leisure|relax|me-time|movie|entertainment|travel|trip|vacation|holiday|concert|show/i.test(combinedText)) {
        return 'Personal';
      }
      
      // If we can't determine a category, default to Work
      return 'Work';
    };
    
    // Helper function to format hour display
    const formatHour = (hour: number): string => {
      if (hour === 0) return '12 AM';
      if (hour === 12) return '12 PM';
      return hour < 12 ? `${hour} AM` : `${hour-12} PM`;
    };
      
      // Create available slots
    const availableSlots: Array<{
      start: Date;
      end: Date;
      day: number;
      hour: number;
    }> = [];
    
    // Calculate the number of days needed to create slots
    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    
    // Create slots for the entire time period
    for (let day = 0; day < totalDays; day++) {
      const dayDate = new Date(periodStart);
      dayDate.setDate(periodStart.getDate() + day);
      
      // Create slots for all hours (0-23)
      for (let hour = 0; hour < 24; hour++) {
        const slotStart = new Date(dayDate);
        slotStart.setHours(hour, 0, 0, 0);
        
        const slotEnd = new Date(slotStart);
        slotEnd.setHours(slotStart.getHours() + 1, 0, 0, 0);
        
        // Skip slots that already have fixed events
        const hasOverlap = fixedEvents.some((event: CalendarEvent) => {
          const eventStart = new Date(event.start_at);
          const eventEnd = new Date(event.end_at);
          
          return (
            slotStart < eventEnd &&
            slotEnd > eventStart
          );
        });
        
        if (!hasOverlap) {
          availableSlots.push({
            start: slotStart,
            end: slotEnd,
            day,
            hour
          });
        }
      }
    }
    
    // Process events by priority level
    const processEventsByPriority = async (events: CalendarEvent[], priorityLabel: string) => {
      console.log(`Starting to schedule ${events.length} events with ${priorityLabel} priority...`);
      
      // Sort events by duration (shortest first) to optimize scheduling
      const sortedEvents = [...events].sort((a, b) => {
        const aDuration = new Date(a.end_at).getTime() - new Date(a.start_at).getTime();
        const bDuration = new Date(b.end_at).getTime() - new Date(b.start_at).getTime();
        return aDuration - bDuration; // Sort shorter events first
      });
      
      // Process each event in the priority group
      for (const event of sortedEvents) {
        // Calculate event duration
        const eventStart = new Date(event.start_at);
        const eventEnd = new Date(event.end_at);
        const eventDuration = eventEnd.getTime() - eventStart.getTime();
        const eventDurationHours = eventDuration / (1000 * 60 * 60);
        
        // Ignore events longer than 8 hours or shorter than 15 minutes
        if (eventDurationHours > 8 || eventDurationHours < 0.25) {
          console.log(`Event "${event.title}" is too long or too short to rearrange (${eventDurationHours.toFixed(1)} hours)`);
          rescheduledEvents.push(event);
          continue;
        }
        
        // Specify default priority if none exists
        const priority = event.priority || 'medium';
        
        // Log priority for debugging
        console.log(`Processing ${priorityLabel} priority event "${event.title}"`);
        
        // Determine the event category
        const category = getEventCategory(event);
        console.log(`Scheduling event: ${event.title} (${category}), Priority: ${priority}`);
        
        // Find the best slot
        let bestSlot: {
          start: Date;
          end: Date;
          day: number;
          hour: number;
        } | null = null;
        let bestScore = -1;
        
        // Get the time window for this category
        const categoryKey = category as string;
        // Always ensure we have a valid time window by falling back to default
        const timeWindow = timeWindows[categoryKey] || timeWindows['default'] || DEFAULT_TIME_WINDOW;
        
        // List of available slots
        const availableSlotsCount = availableSlots.length;
        
        if (availableSlotsCount === 0) {
          console.log(`No slots available for event "${event.title}"`);
          rescheduledEvents.push(event);
          continue;
        }
        
        console.log(`There are ${availableSlotsCount} available slots`);
        
        // Classify slots into different priority groups
        let withinOptimalHours: typeof availableSlots = [];
        let withinPreferredHours: typeof availableSlots = [];
        let outsidePreferredHours: typeof availableSlots = [];
        
        // Classify slots by time type
        for (const slot of availableSlots) {
          const slotHour = slot.start.getHours();
          const isOptimalHour = timeWindow.optimalHours.includes(slotHour);
          const isPreferredHour = slotHour >= timeWindow.startHour && slotHour < timeWindow.endHour;
          
          if (isOptimalHour) {
            withinOptimalHours.push(slot);
          } else if (isPreferredHour) {
            withinPreferredHours.push(slot);
          } else {
            outsidePreferredHours.push(slot);
          }
        }
        
        console.log(`Classified slots: Optimal: ${withinOptimalHours.length}, Preferred: ${withinPreferredHours.length}, Outside: ${outsidePreferredHours.length}`);
        
        // Determine search scope based on priority
        let searchSlots: typeof availableSlots = [];
        
        // Determine search strategy based on event priority
        if (priority === 'high') {
          // Create a list of all time slots in optimal hours (regardless of other events)
          let allOptimalHourSlots: typeof availableSlots = [];
          
          // Reserve optimal hours for high priority events, even if they overlap with other events
          for (let day = 0; day < totalDays; day++) {
            const dayDate = new Date(periodStart);
            dayDate.setDate(periodStart.getDate() + day);
            
            // Create slots specifically for optimal hours
            for (const hour of timeWindow.optimalHours) {
              const slotStart = new Date(dayDate);
              slotStart.setHours(hour, 0, 0, 0);
              
              const slotEnd = new Date(slotStart);
              slotEnd.setHours(slotStart.getHours() + 1, 0, 0, 0);
              
              allOptimalHourSlots.push({
                start: slotStart,
                end: slotEnd,
                day,
                hour
              });
            }
          }
          
          // Prioritize using optimal hours, even if they might overlap with other high priority events
          if (allOptimalHourSlots.length > 0) {
            searchSlots = allOptimalHourSlots;
            console.log(`[HIGH] Searching in all optimal hours (${searchSlots.length} slots), even if they might overlap`);
          } else if (withinPreferredHours.length > 0) {
            searchSlots = withinPreferredHours;
            console.log(`[HIGH] No optimal hours available, searching in preferred hours (${searchSlots.length} slots)`);
          } else {
            // If no slots in preferred hours, must search outside working hours
            searchSlots = outsidePreferredHours;
            console.log(`[HIGH] No slots in working hours, searching outside hours (${searchSlots.length} slots)`);
          }
        } else if (priority === 'medium') {
          // Medium priority: Search in preferred hours first, then outside
          // Remove slots already used by high priority events to avoid conflicts
          const nonConflictingPreferredSlots = [...withinOptimalHours, ...withinPreferredHours].filter(slot => {
            // Check if this slot overlaps with any high priority events
            const slotStart = slot.start.getTime();
            const slotEnd = slot.end.getTime();
            
            // Filter out high priority events that have already been scheduled
            const highPriorityScheduled = rescheduledEvents.filter(e => e.priority === 'high');
            
            // Check if there's a conflict with any high priority event
            const hasConflict = highPriorityScheduled.some(event => {
              const eventStart = new Date(event.start_at).getTime();
              const eventEnd = new Date(event.end_at).getTime();
              return slotStart < eventEnd && slotEnd > eventStart;
            });
            
            return !hasConflict; // Keep if no conflict
          });
          
          if (nonConflictingPreferredSlots.length > 0) {
            searchSlots = nonConflictingPreferredSlots;
            console.log(`[MEDIUM] Searching in working hours without conflicts with high priority (${searchSlots.length} slots)`);
          } else {
            searchSlots = outsidePreferredHours;
            console.log(`[MEDIUM] No slots in working hours, searching outside hours (${searchSlots.length} slots)`);
          }
        } else {
          // Low priority: Start with least preferred slots
          // Remove slots already used by high/medium priority events to avoid conflicts
          const nonConflictingOutsideSlots = outsidePreferredHours.filter(slot => {
            // Check if this slot overlaps with any higher priority events
            const slotStart = slot.start.getTime();
            const slotEnd = slot.end.getTime();
            
            // Filter out high and medium priority events that have already been scheduled
            const higherPriorityScheduled = rescheduledEvents.filter(e => 
              e.priority === 'high' || e.priority === 'medium'
            );
            
            // Check if there's a conflict with any higher priority event
            const hasConflict = higherPriorityScheduled.some(event => {
              const eventStart = new Date(event.start_at).getTime();
              const eventEnd = new Date(event.end_at).getTime();
              return slotStart < eventEnd && slotEnd > eventStart;
            });
            
            return !hasConflict; // Keep if no conflict
          });
          
          if (nonConflictingOutsideSlots.length > 0) {
            searchSlots = nonConflictingOutsideSlots;
            console.log(`[LOW] Prioritizing scheduling outside working hours (${searchSlots.length} slots)`);
          } else {
            // If no slots outside working hours, look for any remaining slots without conflicts
            const anyNonConflictingSlots = availableSlots.filter(slot => {
              const slotStart = slot.start.getTime();
              const slotEnd = slot.end.getTime();
              
              const higherPriorityScheduled = rescheduledEvents.filter(e => 
                e.priority === 'high' || e.priority === 'medium'
              );
              
              const hasConflict = higherPriorityScheduled.some(event => {
                const eventStart = new Date(event.start_at).getTime();
                const eventEnd = new Date(event.end_at).getTime();
                return slotStart < eventEnd && slotEnd > eventStart;
              });
              
              return !hasConflict;
            });
            
            searchSlots = anyNonConflictingSlots;
            console.log(`[LOW] Searching for any available slots (${searchSlots.length} slots)`);
          }
        }
        
        // If no suitable slot is found, keep the original event
        if (searchSlots.length === 0) {
          console.log(`No suitable slot found for event "${event.title}"`);
          rescheduledEvents.push(event);
          continue;
        }
        
        // Find the best slot in the selected range
        for (const currentSlot of searchSlots) {
          // Skip if the slot is not long enough for the event
          if (!currentSlot || currentSlot.end.getTime() - currentSlot.start.getTime() < eventDuration) {
            continue;
          }
          
          // Calculate the score for this slot (the higher the better)
          let score = 0;
          
          // Check if this slot is within the preferred time window for this category
          const slotHour = currentSlot.start.getHours();
          const isWithinPreferredHours = slotHour >= timeWindow.startHour && slotHour < timeWindow.endHour;
          const isOptimalHour = timeWindow.optimalHours.includes(slotHour);
          
          // Get the day of week for the slot
          const slotDate = new Date(currentSlot.start);
          const dayOfWeek = slotDate.getDay(); // 0 = Sunday, 6 = Saturday
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          // Convert day number to day name
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[dayOfWeek];
          
          // Check if the day is preferred (safely)
          const isPreferredDay = Array.isArray(timeWindow.preferredDays) && 
            timeWindow.preferredDays.includes(dayName as string);
          
          // Basic score based on preferred hours
          if (isWithinPreferredHours) {
            score += 100;
          } else {
            // Small penalty for slots outside preferred hours
            score -= 50;
          }
          
          // Bonus for optimal hours
          if (isOptimalHour) {
            score += 100;
          }
          
          // Bonus for preferred days
          if (isPreferredDay) {
            score += 75;
          } else {
            // Penalty for non-preferred days
            score -= 50;
          }
          
          // Adjust based on priority level
          if (priority === 'high') {
            // High priority: Strongly prefer optimal or preferred hours
            if (isOptimalHour) {
              score += 1000; // Very high bonus to prioritize optimal hours
            } else if (isWithinPreferredHours) {
              score += 500; // Prioritize preferred hours
            }
            
            // Bonus when high priority events are placed on preferred days
            if (isPreferredDay) {
              score += 300;
            }
            
            // Encourage overlapping high priority events in optimal hours
            // Instead of penalizing overlapping events, we encourage this
            // for high priority events in optimal hours to make the best use of time
            if (isOptimalHour) {
              // Check if this slot overlaps with other high priority events
              const hasHighPriorityOverlap = rescheduledEvents.some(scheduledEvent => {
                if (scheduledEvent.priority !== 'high') return false;
                
                const scheduledStart = new Date(scheduledEvent.start_at).getTime();
                const scheduledEnd = new Date(scheduledEvent.end_at).getTime();
                const slotStart = currentSlot.start.getTime();
                const slotEnd = currentSlot.end.getTime();
                
                return slotStart < scheduledEnd && slotEnd > scheduledStart;
              });
              
              if (hasHighPriorityOverlap) {
                // Still allow overlapping but with a slightly lower score
                // compared to non-overlapping optimal hour slots
                score -= 200; // Reduce score but still much higher than non-optimal hours
              }
            }
          } 
          else if (priority === 'medium') {
            // Medium priority: Still prefer optimal hours but less strongly
            if (isOptimalHour) {
              score += 150;
            }
            if (isWithinPreferredHours) {
              score += 100;
            }
            if (isPreferredDay) {
              score += 75;
            }
            
            // Heavy penalty if overlapping with high priority
            const hasHighPriorityOverlap = rescheduledEvents.some(scheduledEvent => {
              if (scheduledEvent.priority !== 'high') return false;
              
              const scheduledStart = new Date(scheduledEvent.start_at).getTime();
              const scheduledEnd = new Date(scheduledEvent.end_at).getTime();
              const slotStart = currentSlot.start.getTime();
              const slotEnd = currentSlot.end.getTime();
              
              return slotStart < scheduledEnd && slotEnd > scheduledStart;
            });
            
            if (hasHighPriorityOverlap) {
              score -= 1000; // Very heavy penalty to avoid overlapping with high priority
            }
            
            // Consider original time for medium priority events
            const originalHour = eventStart.getHours();
            const hourDifference = Math.abs(originalHour - slotHour);
            
            // Small bonus for slots close to original time
            score -= hourDifference * 10;
            
            // Consider location for medium priority events
            // If events are at the same location, allow slight overlap
            const hasSameLocationOverlap = rescheduledEvents.some(scheduledEvent => {
              if (scheduledEvent.priority !== 'medium') return false;
              if (scheduledEvent.location !== event.location) return false;
              
              const scheduledStart = new Date(scheduledEvent.start_at).getTime();
              const scheduledEnd = new Date(scheduledEvent.end_at).getTime();
              const slotStart = currentSlot.start.getTime();
              const slotEnd = currentSlot.end.getTime();
              
              return slotStart < scheduledEnd && slotEnd > scheduledStart;
            });
            
            if (hasSameLocationOverlap) {
              // Small penalty for overlapping with same location events
              score -= 100; // Less severe than overlapping with high priority
            }
          } 
          else if (priority === 'low') {
            // Low priority: Focus on avoiding taking slots from high priority
            if (isOptimalHour) {
              score += 20; // Lower score for optimal hours
            }
            if (isWithinPreferredHours) {
              score += 10; // Lower score for preferred hours
            }
            
            // Heavy penalty if overlapping with high/medium priority
            const hasHigherPriorityOverlap = rescheduledEvents.some(scheduledEvent => {
              if (scheduledEvent.priority === 'low') return false;
              
              const scheduledStart = new Date(scheduledEvent.start_at).getTime();
              const scheduledEnd = new Date(scheduledEvent.end_at).getTime();
              const slotStart = currentSlot.start.getTime();
              const slotEnd = currentSlot.end.getTime();
              
              return slotStart < scheduledEnd && slotEnd > scheduledStart;
            });
            
            if (hasHigherPriorityOverlap) {
              score -= 2000; // Extremely heavy penalty to avoid overlapping with high/medium priority
            }
            
            // Encourage scheduling outside working hours with higher score
            if (!isWithinPreferredHours) {
              score += 50; // Bonus for not taking up working hours
            }
            
            // Encourage scheduling at the end of the day
            if (slotHour >= 16) {
              score += 25; // Bonus for end of day
            }
          }
          
          // Close to original time (keep same part of day)
          const originalHour = eventStart.getHours();
          const hourDifference = Math.abs(originalHour - slotHour);
          
          // Smaller penalty for slots close to original time
          score -= hourDifference * 5;
          
          // Close to original day
          const originalDay = Math.floor((eventStart.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000));
          const dayDifference = Math.abs(originalDay - currentSlot.day);
          
          // Higher penalty for slots on different days
          score -= dayDifference * 15;
          
          // Update best slot if this slot is better
          if (score > bestScore) {
            bestScore = score;
            bestSlot = { ...currentSlot };
          }
        }
        
        if (bestSlot) {
          // Set the event to the best slot
          const newStart = new Date(bestSlot.start);
          const newEnd = new Date(newStart);
          newEnd.setTime(newStart.getTime() + eventDuration);
          
          // Log the best slot found
          console.log(`Found best slot for "${event.title}" (${category}, ${priority}):`);
          console.log(`  Old time: ${new Date(event.start_at).toLocaleTimeString()} - ${new Date(event.end_at).toLocaleTimeString()}`);
          console.log(`  New time: ${newStart.toLocaleTimeString()} - ${newEnd.toLocaleTimeString()}`);
          console.log(`  Best score: ${bestScore}`);
          
          // Check if event time has actually changed
          const oldStartTime = new Date(event.start_at).getTime();
          const oldEndTime = new Date(event.end_at).getTime();
          const newStartTime = newStart.getTime();
          const newEndTime = newEnd.getTime();
          
          if (oldStartTime === newStartTime && oldEndTime === newEndTime) {
            console.log(`  Event time has not changed. Keeping original time.`);
            rescheduledEvents.push(event);
          } else {
            // Create the updated event
            const updatedEvent = {
              ...event,
              start_at: newStart.toISOString(),
              end_at: newEnd.toISOString()
            };
            
            // Add conflict handling logic for multiple high priority events
            let conflictDetected = false;
            
            // Check if it overlaps with any already scheduled events
            for (const scheduledEvent of rescheduledEvents) {
              const scheduledStart = new Date(scheduledEvent.start_at).getTime();
              const scheduledEnd = new Date(scheduledEvent.end_at).getTime();
              
              // Check for overlap
              if (
                (newStartTime < scheduledEnd && newEndTime > scheduledStart) &&
                // If both are high priority, consider it a conflict
                (priority === 'high' && scheduledEvent.priority === 'high')
              ) {
                conflictDetected = true;
                console.log(`  Conflict with another high priority event: "${scheduledEvent.title}"`);
                
                // Calculate the length of the conflict
                const overlapStart = Math.max(newStartTime, scheduledStart);
                const overlapEnd = Math.min(newEndTime, scheduledEnd);
                const overlapDuration = overlapEnd - overlapStart;
                
                console.log(`  Conflict duration: ${overlapDuration / (1000 * 60)} minutes`);
                
                // If conflict is longer than 15 minutes, try to resolve it
                if (overlapDuration > 15 * 60 * 1000) {
                  // Solution: Try to shift the current event if possible
                  // Find another slot nearby to move this event
                  // Check if we can move it before or after the scheduled event
                  
                  // Try to find a slot before the scheduled event
                  const slotBefore = {
                    start: new Date(scheduledStart - eventDuration),
                    end: new Date(scheduledStart),
                    day: bestSlot.day,
                    hour: new Date(scheduledStart - eventDuration).getHours()
                  };
                  
                  // Try to find a slot after the scheduled event
                  const slotAfter = {
                    start: new Date(scheduledEnd),
                    end: new Date(scheduledEnd + eventDuration),
                    day: bestSlot.day,
                    hour: new Date(scheduledEnd).getHours()
                  };
                  
                  // Check if the slot before is available
                  let canUseSlotBefore = true;
                  for (const scheduled of rescheduledEvents) {
                    const schedStart = new Date(scheduled.start_at).getTime();
                    const schedEnd = new Date(scheduled.end_at).getTime();
                    
                    if (slotBefore.start.getTime() < schedEnd && slotBefore.end.getTime() > schedStart) {
                      canUseSlotBefore = false;
                      break;
                    }
                  }
                  
                  // Check if the slot after is available
                  let canUseSlotAfter = true;
                  for (const scheduled of rescheduledEvents) {
                    const schedStart = new Date(scheduled.start_at).getTime();
                    const schedEnd = new Date(scheduled.end_at).getTime();
                    
                    if (slotAfter.start.getTime() < schedEnd && slotAfter.end.getTime() > schedStart) {
                      canUseSlotAfter = false;
                      break;
                    }
                  }
                  
                  // Decide which slot to use
                  if (canUseSlotBefore) {
                    console.log(`  Moving event "${event.title}" before event "${scheduledEvent.title}"`);
                    
                    newStart.setTime(slotBefore.start.getTime());
                    newEnd.setTime(slotBefore.end.getTime());
                    
                    updatedEvent.start_at = newStart.toISOString();
                    updatedEvent.end_at = newEnd.toISOString();
                    
                    conflictDetected = false;
                  } else if (canUseSlotAfter) {
                    console.log(`  Moving event "${event.title}" after event "${scheduledEvent.title}"`);
                    
                    newStart.setTime(slotAfter.start.getTime());
                    newEnd.setTime(slotAfter.end.getTime());
                    
                    updatedEvent.start_at = newStart.toISOString();
                    updatedEvent.end_at = newEnd.toISOString();
                    
                    conflictDetected = false;
                  }
                  // If neither slot is available, keep the conflict
                }
                
                break;
              }
            }
            
            // If there's still a conflict that can't be resolved, keep the original time
            if (conflictDetected) {
              console.log(`  Could not resolve conflict. Keeping original time.`);
              rescheduledEvents.push(event);
            } else {
              // Add to the list of rescheduled events
              rescheduledEvents.push(updatedEvent);
              
              // Remove the used slot and any overlapping slots
              // First, remove the exact slot
              const slotIndex = availableSlots.findIndex(
                slot => slot.start.getTime() === bestSlot.start.getTime()
              );
              
              if (slotIndex > -1) {
                availableSlots.splice(slotIndex, 1);
                
                // Then, remove any slots that would now overlap with this event
                const eventEnd = new Date(bestSlot.start.getTime() + eventDuration);
                const overlappingSlots = availableSlots.filter((slot: {
                  start: Date;
                  end: Date;
                  day: number;
                  hour: number;
                }) => 
                  slot.start < eventEnd && slot.end > bestSlot.start
                );
                
                for (const slot of overlappingSlots) {
                  const idx = availableSlots.indexOf(slot);
                  if (idx > -1) {
                    availableSlots.splice(idx, 1);
                  }
                }
              }
              
              // Update the event in the database
              try {
                await updateEvent(event.id, updatedEvent);
                console.log(`Rescheduled "${event.title}" to ${newStart.toLocaleTimeString()} (${category}, Priority: ${priority})`);
              } catch (error) {
                console.error('Failed to update event during rescheduling:', error);
              }
            }
          }
        } else {
          // If no suitable slot is found, keep the original event
          console.log(`No suitable slot found for "${event.title}" (${category}, Priority: ${priority})`);
          rescheduledEvents.push(event);
        }
      }
    };
    
    // Process events in priority order: high -> medium -> low
    await processEventsByPriority(highPriorityEvents, 'high');
    await processEventsByPriority(mediumPriorityEvents, 'medium');
    await processEventsByPriority(lowPriorityEvents, 'low');
    
    // Refresh the calendar
    refresh();
    
    return rescheduledEvents;
  }, [events, ws?.id, updateEvent, refresh, settings]);

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
    rescheduleEvents,

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

    // Google Calendar API
    syncWithGoogleCalendar,
    syncAllFromGoogleCalendar,

    // Settings API
    settings,
    updateSettings,
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

// Helper function to format hour display
const formatHour = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour-12} PM`;
};