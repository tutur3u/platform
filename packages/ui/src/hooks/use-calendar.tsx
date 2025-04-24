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

// Utility function to fetch data from Gemini API
const callGeminiAPI = async (prompt: string, apiKey: string): Promise<any> => {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
};

// Add geminiApiKey to SmartSchedulingSettings type if it doesn't exist
declare module '@tuturuuu/ui/legacy/calendar/settings/CalendarSettingsContext' {
  interface SmartSchedulingSettings {
    geminiApiKey?: string;
    categoryTimeSettings?: Record<string, CategoryTimeSetting>;
  }
}

// Interface for TimeSlot
export interface TimeSlot {
  id: string;
  startHour: number;
  endHour: number;
}

// Interface for CategoryTimeSetting
export interface CategoryTimeSetting {
  timeSlots: Record<string, TimeSlot[]>; // key is day of week, value is array of time slots
  preferredDays: string[];
  optimalHours: number[]; // Keep for backward compatibility
  startHour: number;      // Keep for backward compatibility
  endHour: number;        // Keep for backward compatibility
}

// Type alias for the entire settings object
export type CategoryTimeSettings = Record<string, CategoryTimeSetting>;

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

  // Define the smartScheduleWithGemini function
  const smartScheduleWithGemini = useCallback(async (
    events: CalendarEvent[],
    startDate: Date,
    endDate: Date,
    apiKey: string
  ) => {
    // Implementation will be added in future
    console.log('Smart scheduling with Gemini is not implemented yet');
    return events;
  }, []);

  // Enhancement: use the user's preferred timeSettings from CategoryTimeConfigDialog
  const enhancedRescheduleEvents = useCallback(async (
    events: CalendarEvent[], 
    startDate: Date, 
    endDate: Date,
    categoryTimeSettings: Record<string, any>
  ) => {
    console.log("🔄 enhancedRescheduleEvents được gọi với:", {
      eventsCount: events.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      settingsCount: Object.keys(categoryTimeSettings).length
    });
    
    try {
      // Sort events by priority and then by duration (longer events first)
      const sortedEvents = [...events].sort((a, b) => {
        // First by priority
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const aPriority = a.priority || 'medium';
        const bPriority = b.priority || 'medium';
        
        const aPriorityValue = priorityOrder[aPriority as keyof typeof priorityOrder] || 1;
        const bPriorityValue = priorityOrder[bPriority as keyof typeof priorityOrder] || 1;
        
        if (aPriorityValue !== bPriorityValue) {
          return aPriorityValue - bPriorityValue;
        }
        
        // Then by duration (longer events first)
        const aDuration = new Date(a.end_at).getTime() - new Date(a.start_at).getTime();
        const bDuration = new Date(b.end_at).getTime() - new Date(b.start_at).getTime();
        return bDuration - aDuration;
      });
      
      console.log("🔄 Sự kiện đã sắp xếp theo ưu tiên:", sortedEvents.map(e => ({
        title: e.title,
        priority: e.priority || 'medium',
        duration: (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / (1000 * 60) + ' minutes'
      })));
      
      // Keep track of scheduled events and time slots that have been used
      const scheduledEvents: CalendarEvent[] = [];
      const occupiedSlots: Set<string> = new Set();
      
      // Group events by category
      const eventsByCategory: Record<string, CalendarEvent[]> = {};
      for (const event of sortedEvents) {
        let category = event.metadata?.category || '';
        
        // Try to infer category from title if not set
        if (!category) {
          const title = event.title?.toLowerCase() || '';
          if (title.includes('meeting') || title.includes('họp')) {
            category = 'Meeting';
          } else if (title.includes('work') || title.includes('công việc')) {
            category = 'Work';
          } else {
            category = 'Personal';
          }
        }
        
        // Initialize the array if it doesn't exist
        if (!eventsByCategory[category]) {
          eventsByCategory[category] = [];
        }
        
        // Now we know for sure the array exists
        (eventsByCategory[category] as CalendarEvent[]).push(event);
      }
      
      console.log("📊 Sự kiện theo danh mục:", Object.fromEntries(
        Object.entries(eventsByCategory).map(([category, events]) => 
          [category, events.length]
        )
      ));
      
      // Process each category
      for (const [category, categoryEvents] of Object.entries(eventsByCategory)) {
        console.log(`🔄 Xử lý danh mục: ${category} (${categoryEvents.length} sự kiện)`);
        
        const categorySettings = categoryTimeSettings[category];
        
        if (!categorySettings) {
          console.log(`⚠️ Không có cài đặt cho danh mục: ${category}, giữ nguyên thời gian gốc`);
          // Keep original times if no settings exist
          categoryEvents.forEach(e => scheduledEvents.push(e));
          continue;
        }
        
        console.log(`ℹ️ Cài đặt cho danh mục ${category}:`, {
          preferredDays: categorySettings.preferredDays,
          startHour: categorySettings.startHour,
          endHour: categorySettings.endHour,
          hasTimeSlots: !!categorySettings.timeSlots && Object.keys(categorySettings.timeSlots).length > 0
        });
        
        // Create an array of all days in the period
        const allDays: Date[] = [];
        let currentDay = new Date(startDate);
        while (currentDay <= endDate) {
          allDays.push(new Date(currentDay));
          currentDay.setDate(currentDay.getDate() + 1);
        }
        
        // Process each event in this category
        for (const event of categoryEvents) {
          const eventDuration = new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
          const eventDurationHours = eventDuration / (1000 * 60 * 60);
          
          // Skip events that are too long (more than 24 hours)
          if (eventDurationHours > 24) {
            scheduledEvents.push(event);
            continue;
          }
          
          // Find all possible time slots for this event
          const potentialSlots: Array<{
            day: Date;
            startHour: number;
            score: number;
          }> = [];
          
          // Look at each day
          for (const day of allDays) {
            const dayOfWeekIndex = day.getDay();
            const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeekIndex];
            const isPreferredDay = categorySettings.preferredDays?.includes(dayOfWeek) || false;
            
            // Skip non-preferred days unless no preferred days are specified
            if (!isPreferredDay && categorySettings.preferredDays?.length > 0) {
              continue;
            }
            
            // Check if we have specific time slots for this day
            let timeSlots: Array<{startHour: number, endHour: number}> = [];
            
            // Try to get time slots from the categorySettings
            if (categorySettings.timeSlots && 
                typeof categorySettings.timeSlots === 'object' && 
                dayOfWeek && 
                categorySettings.timeSlots[dayOfWeek] && 
                Array.isArray(categorySettings.timeSlots[dayOfWeek])) {
              // We have specific time slots for this day
              timeSlots = categorySettings.timeSlots[dayOfWeek];
            } else if (categorySettings.startHour !== undefined && categorySettings.endHour !== undefined) {
              // Use default start/end hours if specific slots aren't available
              timeSlots = [{
                startHour: categorySettings.startHour,
                endHour: categorySettings.endHour
              }];
            }
            
            // Process each time slot
            for (const slot of timeSlots) {
              const { startHour, endHour } = slot;
              
              // Skip slots that are too short
              if (endHour - startHour < eventDurationHours) {
                continue;
              }
              
              // Loop through possible start times within this slot (in 30 min increments)
              for (let hour = startHour; hour <= endHour - eventDurationHours; hour += 0.5) {
                // Build a unique slot ID
                const slotKey = `${day.toISOString().split('T')[0]}-${hour.toString()}`;
                
                // Skip if this slot is already occupied
                if (occupiedSlots.has(slotKey)) {
                  continue;
                }
                
                // Calculate a score for this slot
                let score = 1000; // Base score
                
                // Preferred day bonus
                if (isPreferredDay) {
                  score += 500;
                }
                
                // Optimal hour bonus (if the hour falls within optimal hours)
                if (categorySettings.optimalHours && 
                    Array.isArray(categorySettings.optimalHours) && 
                    categorySettings.optimalHours.includes(Math.floor(hour))) {
                  score += 200;
                }
                
                // Custom time slot bonus (if this slot is from a custom time slot definition)
                if (categorySettings.timeSlots && 
                    typeof categorySettings.timeSlots === 'object' && 
                    dayOfWeek && 
                    categorySettings.timeSlots[dayOfWeek]) {
                  score += 300;
                }
                
                // Add this potential slot
                potentialSlots.push({
                  day,
                  startHour: hour,
                  score
                });
              }
            }
          }
          
          // If we found potential slots, pick the best one
          if (potentialSlots.length > 0) {
            // Sort by score (highest first)
            potentialSlots.sort((a, b) => b.score - a.score);
            
            // Take the highest scoring slot
            const bestSlot = potentialSlots[0];
            
            if (bestSlot) {
              // Create the new start and end times
              const hourParts = bestSlot.startHour.toString().split('.');
              const startHours = parseInt(hourParts[0] || '0');
              const startMinutes = hourParts.length > 1 ? parseInt(hourParts[1] || '0') * 60 : 0;
              
              const newStartTime = new Date(bestSlot.day);
              newStartTime.setHours(startHours, startMinutes, 0, 0);
              
              const newEndTime = new Date(newStartTime);
              newEndTime.setTime(newStartTime.getTime() + eventDuration);
              
              // Update the event
              const updatedEvent = {
                ...event,
                start_at: newStartTime.toISOString(),
                end_at: newEndTime.toISOString(),
                metadata: {
                  ...event.metadata || {},
                  category,
                  auto_scheduled: true,
                  scheduling_score: bestSlot.score,
                  last_rescheduled: new Date().toISOString()
                }
              };
              
              // Mark this slot as occupied
              occupiedSlots.add(`${bestSlot.day.toISOString().split('T')[0]}-${bestSlot.startHour.toString()}`);
              
              // Add this updated event to the scheduled events
              scheduledEvents.push(updatedEvent);
            } else {
              // No suitable slot found, keep original time
              scheduledEvents.push(event);
            }
          } else {
            // No suitable slot found, keep original time
            scheduledEvents.push(event);
          }
        }
      }
      
      return scheduledEvents;
    } catch (error) {
      console.error('Error in enhanced reschedule events:', error);
      return events;
    }
  }, [updateEvent]);
  
  // Enhanced version of rescheduleEvents that uses Gemini if API key is available
  const rescheduleEvents = useCallback(async (startDate?: Date, endDate?: Date, viewMode: 'day' | '4-days' | 'week' | 'month' = 'week') => {
    console.log("🔍 rescheduleEvents được gọi với:", { startDate, endDate, viewMode });
    
    if (!ws?.id) {
      console.error("❌ Không có workspace ID, không thể lên lịch");
      return;
    }
    
    // Determine the time period based on the view mode
    let periodStart: Date;
    let periodEnd: Date;
    
    if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      periodStart = new Date(today);
      periodEnd = new Date(today);
      
      if (viewMode === 'day') {
        periodEnd.setHours(23, 59, 59, 999);
      } else if (viewMode === '4-days') {
        periodEnd.setDate(periodEnd.getDate() + 3);
        periodEnd.setHours(23, 59, 59, 999);
      } else if (viewMode === 'week') {
        // Adjust to start of week (Monday)
        const dayOfWeek = periodStart.getDay();
        const diff = periodStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        periodStart.setDate(diff);
        
        // End of week (Sunday)
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 6);
        periodEnd.setHours(23, 59, 59, 999);
      } else if (viewMode === 'month') {
        // Start of month
        periodStart.setDate(1);
        
        // End of month
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
        periodEnd.setHours(23, 59, 59, 999);
      }
    }
    
    console.log("📅 Khoảng thời gian sắp xếp:", {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString()
    });
    
    // Get all events in the selected time period
    const allEvents = events.filter((event: CalendarEvent) => {
      const eventStart = new Date(event.start_at);
      return eventStart >= periodStart && eventStart <= periodEnd;
    });
    
    console.log(`📋 Đã tìm thấy ${allEvents.length} sự kiện trong khoảng thời gian đã chọn`);
    
    // Check if Gemini API key is available in settings
    const geminiApiKey = settings?.smartScheduling?.geminiApiKey;
    
    if (geminiApiKey) {
      console.log('🤖 Sử dụng Gemini 2.0 Flash cho lập lịch thông minh');
      return await smartScheduleWithGemini(allEvents, periodStart, periodEnd, geminiApiKey);
    } else {
      console.log('⚙️ Sử dụng phương pháp lập lịch nâng cao');
      
      // First, make sure we only schedule unlocked events
      const fixedEvents = allEvents.filter(
        (event: CalendarEvent) => event.locked
      );
      
      // Events that can be rescheduled (all non-locked events)
      const rescheduleableEvents = allEvents.filter(
        (event: CalendarEvent) => !event.locked
      );
      
      console.log(`🔒 Sự kiện cố định: ${fixedEvents.length}, Sự kiện có thể sắp xếp: ${rescheduleableEvents.length}`);
      
      // Get the user's category time settings
      let userCategoryTimeSettings = settings?.smartScheduling?.categoryTimeSettings || {};
      
      // If no category time settings exist, generate default ones
      if (Object.keys(userCategoryTimeSettings).length === 0) {
        console.log('⚠️ Không tìm thấy cài đặt thời gian danh mục, sử dụng mặc định');
        
        // Generate default settings for basic categories
        const defaultTimeSettings: Record<string, CategoryTimeSetting> = {
          'Work': {
            preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            optimalHours: [9, 10, 11, 14, 15, 16],
            startHour: 9,
            endHour: 17,
            timeSlots: {
              'monday': [{ id: 'monday-work', startHour: 9, endHour: 17 }],
              'tuesday': [{ id: 'tuesday-work', startHour: 9, endHour: 17 }],
              'wednesday': [{ id: 'wednesday-work', startHour: 9, endHour: 17 }],
              'thursday': [{ id: 'thursday-work', startHour: 9, endHour: 17 }],
              'friday': [{ id: 'friday-work', startHour: 9, endHour: 17 }],
            }
          },
          'Meeting': {
            preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            optimalHours: [10, 11, 14, 15],
            startHour: 10,
            endHour: 16,
            timeSlots: {
              'monday': [
                { id: 'monday-meeting-1', startHour: 10, endHour: 12 },
                { id: 'monday-meeting-2', startHour: 14, endHour: 16 }
              ],
              'tuesday': [
                { id: 'tuesday-meeting-1', startHour: 10, endHour: 12 },
                { id: 'tuesday-meeting-2', startHour: 14, endHour: 16 }
              ],
              'wednesday': [
                { id: 'wednesday-meeting-1', startHour: 10, endHour: 12 },
                { id: 'wednesday-meeting-2', startHour: 14, endHour: 16 }
              ],
              'thursday': [
                { id: 'thursday-meeting-1', startHour: 10, endHour: 12 },
                { id: 'thursday-meeting-2', startHour: 14, endHour: 16 }
              ],
              'friday': [
                { id: 'friday-meeting-1', startHour: 10, endHour: 12 },
                { id: 'friday-meeting-2', startHour: 14, endHour: 16 }
              ]
            }
          },
          'Personal': {
            preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            optimalHours: [6, 7, 18, 19, 20, 21],
            startHour: 6,
            endHour: 22,
            timeSlots: {
              'monday': [
                { id: 'monday-personal-1', startHour: 6, endHour: 8 },
                { id: 'monday-personal-2', startHour: 18, endHour: 22 }
              ],
              'tuesday': [
                { id: 'tuesday-personal-1', startHour: 6, endHour: 8 },
                { id: 'tuesday-personal-2', startHour: 18, endHour: 22 }
              ],
              'wednesday': [
                { id: 'wednesday-personal-1', startHour: 6, endHour: 8 },
                { id: 'wednesday-personal-2', startHour: 18, endHour: 22 }
              ],
              'thursday': [
                { id: 'thursday-personal-1', startHour: 6, endHour: 8 },
                { id: 'thursday-personal-2', startHour: 18, endHour: 22 }
              ],
              'friday': [
                { id: 'friday-personal-1', startHour: 6, endHour: 8 },
                { id: 'friday-personal-2', startHour: 18, endHour: 22 }
              ],
              'saturday': [
                { id: 'saturday-personal', startHour: 10, endHour: 20 }
              ],
              'sunday': [
                { id: 'sunday-personal', startHour: 10, endHour: 20 }
              ]
            }
          }
        };
        
        console.log('📝 Đã tạo cài đặt mặc định:', defaultTimeSettings);
        
        // Save these default settings for future use
        try {
          updateSettings({
            smartScheduling: {
              ...settings.smartScheduling,
              categoryTimeSettings: defaultTimeSettings
            }
          });
          console.log('✅ Đã lưu cài đặt mặc định vào settings');
        } catch (error) {
          console.error('❌ Lỗi khi lưu cài đặt mặc định:', error);
        }
        
        userCategoryTimeSettings = defaultTimeSettings;
      }
      
      // Log the settings for debugging
      console.log('⚙️ Cài đặt thời gian danh mục:', JSON.stringify(userCategoryTimeSettings, null, 2));
      
      try {
        // Schedule the events using the enhanced function
        console.log('🔄 Gọi enhancedRescheduleEvents với', rescheduleableEvents.length, 'sự kiện');
        const result = await enhancedRescheduleEvents(
          rescheduleableEvents,
          periodStart,
          periodEnd,
          userCategoryTimeSettings
        );
        
        // Combine fixed events with rescheduled events
        const finalEvents = [...fixedEvents, ...result];
        console.log(`✅ Hoàn thành lên lịch: ${finalEvents.length} sự kiện tổng cộng (${fixedEvents.length} cố định + ${result.length} đã sắp xếp)`);
        
        // Refresh the calendar
        refresh();
        
        return finalEvents;
      } catch (error) {
        console.error('❌ Lỗi trong quá trình lên lịch:', error);
        return allEvents; // Return original events in case of error
      }
    }
  }, [events, ws?.id, settings, refresh, enhancedRescheduleEvents, smartScheduleWithGemini, updateSettings]);

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

    smartScheduleWithGemini,
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