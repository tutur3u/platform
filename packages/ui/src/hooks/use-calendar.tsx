import { createClient } from '@tuturuuu/supabase/next/client';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { CalendarEvent, EventPriority } from '@tuturuuu/types/primitives/calendar-event';
import {
  CalendarSettings,
  defaultCalendarSettings,
  CategoryTimeSetting as SettingsContextCategoryTimeSetting,
  CategoryTimeSettings as SettingsContextCategoryTimeSettings
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

// Add geminiApiKey to SmartSchedulingSettings type if it doesn't exist
declare module '@tuturuuu/ui/legacy/calendar/settings/CalendarSettingsContext' {
  interface SmartSchedulingSettings {
    geminiApiKey?: string;
    categoryTimeSettings?: Record<string, CategoryTimeSetting>;
  }
}

// Cập nhật định nghĩa TimeSlot để phù hợp với định nghĩa trong CategoryTimeConfigDialog.tsx
export interface TimeSlot {
  id: string;
  startHour: number;
  endHour: number;
}

// Cập nhật định nghĩa CategoryTimeSetting để mở rộng từ định nghĩa trong context
export interface CategoryTimeSetting extends SettingsContextCategoryTimeSetting {
  timeSlots: Record<string, TimeSlot[]>; // Đảm bảo timeSlots không undefined
}

// Cập nhật kiểu CategoryTimeSettings
export type CategoryTimeSettings = Record<string, CategoryTimeSetting>;

// Cập nhật hàm migrateTimeSettings để đảm bảo tính nhất quán
const migrateTimeSettings = (oldSettings: SettingsContextCategoryTimeSettings): CategoryTimeSettings => {
  const newSettings: CategoryTimeSettings = { ...oldSettings as any };
  
  // Loop through each category
  Object.keys(newSettings).forEach(category => {
    const setting = newSettings[category];
    
    if (setting) {
      // If timeSlots doesn't exist or is empty, create it
      if (!setting.timeSlots || Object.keys(setting.timeSlots).length === 0) {
        setting.timeSlots = {};
        
        // For each preferred day, create a time slot with the start and end hours
        (setting.preferredDays || []).forEach(day => {
          setting.timeSlots[day] = [
            { 
              id: Math.random().toString(36).substring(2, 15), 
              startHour: setting.startHour || 9, 
              endHour: setting.endHour || 17 
            }
          ];
        });
      } else {
        // Ensure all time slots have proper IDs
        Object.keys(setting.timeSlots).forEach(day => {
          const slots = setting.timeSlots[day];
          if (slots && slots.length > 0) {
            slots.forEach(slot => {
              if (!slot.id) {
                slot.id = Math.random().toString(36).substring(2, 15);
              }
            });
          }
        });
      }

      // Ensure all preferred days have time slots
      (setting.preferredDays || []).forEach(day => {
        if (!setting.timeSlots[day] || setting.timeSlots[day].length === 0) {
          setting.timeSlots[day] = [
            { 
              id: Math.random().toString(36).substring(2, 15), 
              startHour: setting.startHour || 9, 
              endHour: setting.endHour || 17 
            }
          ];
        }
      });

      // Update optimalHours based on time slots
      let allHours: number[] = [];
      Object.values(setting.timeSlots).forEach(slots => {
        slots.forEach(slot => {
          // Add all hours within the slot's range
          for (let hour = slot.startHour; hour <= slot.endHour; hour++) {
            if (!allHours.includes(hour)) {
              allHours.push(hour);
            }
          }
        });
      });

      // Sort hours and update optimalHours
      if (allHours.length > 0) {
        allHours.sort((a, b) => a - b);
        setting.optimalHours = allHours;
        setting.startHour = allHours[0] || 9;
        setting.endHour = allHours[allHours.length - 1] || 17;
      }
    }
  });
  
  return newSettings;
};

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

      // Tạo một bản ghi log để debug
      console.log(`🔄 Updating event ${eventId} with:`, eventUpdates);

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

    const doOverlap = event1Start < event2End && event1End > event2Start;
    
    if (doOverlap) {
      console.log(`⚠️ Overlap detected between "${event1.title}" and "${event2.title}"`);
      console.log(`  Event 1: ${new Date(event1.start_at).toLocaleString()} - ${new Date(event1.end_at).toLocaleString()}`);
      console.log(`  Event 2: ${new Date(event2.start_at).toLocaleString()} - ${new Date(event2.end_at).toLocaleString()}`);
    }
    
    return doOverlap;
  };

  // Helper function to get priority value
  const getPriorityValue = (priority?: EventPriority | null): number => {
    if (!priority) return 1; // Default to medium
    
    switch (priority) {
      case 'high': return 2;
      case 'medium': return 1;
      case 'low': return 0;
      default: return 1;
    }
  };

  // Helper function to get duration in minutes
  const getDurationInMinutes = (event: CalendarEvent): number => {
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    return Math.max(30, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
  };

  // Sửa lại enhancedRescheduleEvents để chỉ di chuyển sự kiện trong cùng ngày
  const enhancedRescheduleEvents = useCallback(
    async (
      events: CalendarEvent[],
      startDate: Date,
      endDate: Date,
      categoryTimeSettings: Record<string, CategoryTimeSetting>
    ) => {
      console.log('⚙️ Starting enhancedRescheduleEvents with', events.length, 'events');
      console.log('📅 Start date:', startDate.toISOString(), '- End date:', endDate.toISOString());
      console.log('📝 Category time settings:', JSON.stringify(categoryTimeSettings, null, 2));
      console.log('⚡ Mode: same day only (events will stay on their original day)');
      
      // Create an object to track scheduled time slots
      const scheduledTimeSlots: Record<string, boolean> = {};
      
      // Create an array of all days in the period - for tracking
      const daysInPeriod: Date[] = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        daysInPeriod.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      console.log('📅 Days in period:', daysInPeriod.map(d => d.toLocaleDateString()));
      
      // Sort events by priority
      const sortedEvents = [...events].sort((a, b) => {
        const priorityA = getPriorityValue(a.priority);
        const priorityB = getPriorityValue(b.priority);
        
        if (priorityA !== priorityB) {
          return priorityB - priorityA; // Higher priority first
        }
        
        // For same priority, sort by duration (longer first)
        const durationA = getDurationInMinutes(a);
        const durationB = getDurationInMinutes(b);
        return durationB - durationA;
      });
      
      // Create results array
      const scheduledEvents: CalendarEvent[] = [];
      
      // Schedule each event
      for (const event of sortedEvents) {
        const category = event.metadata?.category || 'Work';
        const categorySettings = categoryTimeSettings[category];
        
        if (!categorySettings) {
          console.log(`⚠️ No settings for category "${category}", keeping original time for event "${event.title}"`);
          scheduledEvents.push(event);
          continue;
        }
        
        // Get the original date details
        const originalStartDate = new Date(event.start_at);
        const originalEndDate = new Date(event.end_at);
        const eventDurationMinutes = getDurationInMinutes(event);
        
        // Flag to mark if the event has been scheduled
        let eventScheduled = false;
        
        // Get the original day of the event
        const originalDay = new Date(originalStartDate);
        originalDay.setHours(0, 0, 0, 0);
        
        // Check if this day is within the selected time range
        if (originalDay < startDate || originalDay > endDate) {
          console.log(`⚠️ Original day ${originalDay.toLocaleDateString()} not in selected range for "${event.title}", keeping original time`);
          scheduledEvents.push(event);
          continue;
        }
        
        // Get the day of week of the original day
        const originalDayOfWeek = getDayOfWeek(originalDay).toLowerCase();
        console.log(`🔍 Event "${event.title}" is on ${originalDayOfWeek} (${originalDay.toLocaleDateString()})`);
        
        // Check preferred days for this category
        const preferredDays = categorySettings.preferredDays || [];
        
        // Only proceed if the original day is a preferred day
        if (!preferredDays.includes(originalDayOfWeek)) {
          console.log(`⚠️ Original day ${originalDayOfWeek} not in preferred days for category "${category}", keeping original time`);
          scheduledEvents.push(event);
          continue;
        }
        
        // Get time slots for this day
        const timeSlots = categorySettings.timeSlots?.[originalDayOfWeek] || [];
        
        if (timeSlots.length === 0) {
          console.log(`⚠️ No time slots defined for ${originalDayOfWeek} for category "${category}", keeping original time`);
          scheduledEvents.push(event);
          continue;
        }
        
        // Sort time slots by start hour
        const sortedTimeSlots = [...timeSlots].sort((a, b) => a.startHour - b.startHour);
        
        // Try each time slot
        for (const timeSlot of sortedTimeSlots) {
          const slotStartHour = timeSlot.startHour;
          const slotEndHour = timeSlot.endHour;
          
          console.log(`🕒 Trying time slot ${slotStartHour}:00-${slotEndHour}:00 on ${originalDay.toLocaleDateString()} for "${event.title}"`);
          
          // Calculate hours available in this slot
          const availableHours = slotEndHour - slotStartHour;
          const requiredHours = Math.ceil(eventDurationMinutes / 60);
          
          if (availableHours < requiredHours) {
            console.log(`⏱️ Event requires ${requiredHours} hours, but slot only has ${availableHours} hours`);
            continue;
          }
          
          // Try each hour in the time slot
          for (let hour = slotStartHour; hour <= slotEndHour - requiredHours; hour++) {
            // Create new start date - USING ORIGINAL DAY
            const newStartDate = new Date(originalDay);
            newStartDate.setHours(hour, 0, 0, 0);
            
            // Debug log to check new date and time
            console.log(`🔄 Trying to schedule "${event.title}" at:`, {
              originalDate: originalStartDate.toLocaleDateString(),
              newDate: newStartDate.toLocaleDateString(),
              time: `${hour}:00`,
              fullDateTime: newStartDate.toLocaleString(),
              day: originalDay.toDateString(),
              dayOfWeek: originalDayOfWeek
            });
            
            // Create new end date
            const newEndDate = new Date(newStartDate);
            newEndDate.setMinutes(newStartDate.getMinutes() + eventDurationMinutes);
            
            // Debug log to check both start and end times
            console.log(`  ⏰ Duration: ${eventDurationMinutes} minutes, End time: ${newEndDate.toLocaleString()}`);
            
            // Check if this time overlaps with any already scheduled events
            let hasOverlap = false;
            
            // Check against all scheduled events
            for (const scheduledEvent of scheduledEvents) {
              if (eventsOverlap(
                {
                  ...event,
                  start_at: newStartDate.toISOString(),
                  end_at: newEndDate.toISOString()
                },
                scheduledEvent
              )) {
                hasOverlap = true;
                break;
              }
            }
            
            if (!hasOverlap) {
              // Update event time
              const scheduledEvent = {
                ...event,
                start_at: newStartDate.toISOString(),
                end_at: newEndDate.toISOString(),
                metadata: {
                  ...event.metadata,
                  last_scheduled: new Date().toISOString(),
                  scheduling_day: originalDay.toLocaleDateString(),
                  scheduling_slot: `${hour}:00-${newEndDate.getHours()}:${newEndDate.getMinutes()}`
                }
              };
              
              console.log(`✅ SUCCESSFULLY SCHEDULED "${event.title}" on ${originalDay.toLocaleDateString()} at ${hour}:00-${newEndDate.getHours()}:${newEndDate.getMinutes()}`);
              console.log(`   From: ${new Date(event.start_at).toLocaleString()} → To: ${newStartDate.toLocaleString()}`);
              
              // Add to the list of scheduled events
              scheduledEvents.push(scheduledEvent);
              eventScheduled = true;
              
              // Mark this time slot as used
              for (let h = hour; h < newEndDate.getHours(); h++) {
                scheduledTimeSlots[`${originalDayOfWeek}-${h}`] = true;
              }
              
              break;
            } else {
              console.log(`❌ Time ${hour}:00 on ${originalDay.toLocaleDateString()} overlaps with existing events for "${event.title}"`);
            }
          }
          
          if (eventScheduled) break;
        }
        
        // If the event couldn't be scheduled, keep the original time
        if (!eventScheduled) {
          console.log(`⚠️ Could not find suitable time for "${event.title}" on ${originalDay.toLocaleDateString()}, keeping original time`);
          scheduledEvents.push(event);
        }
      }
      
      console.log(`✅ Scheduling complete with ${scheduledEvents.length} events (${scheduledEvents.filter(e => e.metadata?.last_scheduled).length} rescheduled)`);
      return scheduledEvents;
    },
    [getDurationInMinutes, getPriorityValue, eventsOverlap]
  );
  
  // Thêm lại hàm callGeminiAPI
  const callGeminiAPI = async (prompt: string, apiKey?: string): Promise<any> => {
    try {
      console.log('🤖 Gửi yêu cầu đến API lịch thông minh...');
      
      // Sử dụng API endpoint mới thay vì gọi trực tiếp đến Gemini
      // Thêm origin vào URL để đảm bảo gọi đúng endpoint
      let apiUrl = '/api/v1/calendar/smart-scheduling';
      
      // Nếu đang ở môi trường client, thử lấy origin
      if (typeof window !== 'undefined') {
        const origin = window.location.origin;
        apiUrl = `${origin}/api/v1/calendar/smart-scheduling`;
      }
      
      console.log('📝 Calling API at:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          apiKey, // Sẽ sử dụng API key từ môi trường nếu không được cung cấp
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Lỗi API lịch thông minh:', errorText);
        throw new Error(`Lỗi API lịch thông minh: ${errorText}`);
      }
      
      const result = await response.json();
      
      // Kiểm tra kết quả
      if (!result.success) {
        console.error('❌ Lỗi khi lập lịch thông minh:', result.error || 'Không xác định');
        throw new Error(`Lỗi khi lập lịch thông minh: ${result.error || 'Không xác định'}`);
      }
      
      // Trả về dữ liệu phân tích
      if (result.data) {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(result.data)
                  }
                ]
              }
            }
          ]
        };
      } else if (result.rawText) {
        // Fallback nếu không thể phân tích dữ liệu ở API
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: result.rawText
                  }
                ]
              }
            }
          ]
        };
        } else {
        throw new Error('Không nhận được dữ liệu hợp lệ từ API lịch thông minh');
      }
    } catch (error) {
      console.error('❌ Lỗi khi gọi API lịch thông minh:', error);
      throw error;
    }
  };

  // Định nghĩa lại hàm smartScheduleWithGemini
  const smartScheduleWithGemini = useCallback(
    async (
      events: CalendarEvent[],
      startDate: Date,
      endDate: Date,
      apiKey?: string,
      categoryTimeSettings: Record<string, CategoryTimeSetting> = {}
    ) => {
      console.log('🧠 Smart scheduling with Gemini (Reclaim AI style)...');
      
      try {
        // Create list of days in the period
        const daysInPeriod: Date[] = [];
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          daysInPeriod.push(new Date(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        console.log('📅 Days in period:', daysInPeriod.map(d => d.toLocaleDateString()));
        
        // Categorize events
        const fixedEvents = events.filter(e => e.locked || e.priority === 'high');
        const eventsToReschedule = events.filter(e => !e.locked && e.priority !== 'high')
          // Sort events by priority and length
          .sort((a, b) => {
            const priorityDiff = getPriorityValue(b.priority) - getPriorityValue(a.priority);
            if (priorityDiff !== 0) return priorityDiff;
            
            // If same priority, sort by duration (longer first)
            const durationA = getDurationInMinutes(a);
            const durationB = getDurationInMinutes(b);
            return durationB - durationA;
          });
        
        console.log(`🔍 Found ${fixedEvents.length} fixed events and ${eventsToReschedule.length} events to reschedule`);
        
        if (eventsToReschedule.length === 0) {
          console.log('⚠️ No events to reschedule');
          return events;
        }
        
        // Extract current user's working hours
        const workingHours = {
          start: 9, // Default 9 AM
          end: 17, // Default 5 PM
          // Add logic to detect working hours from user's calendar if possible
        };
        
        // Calculate time blocks already used (from fixed events)
        const usedTimeBlocks = fixedEvents.map(event => ({
          start: new Date(event.start_at),
          end: new Date(event.end_at),
          title: event.title
        }));
        
        // Analyze user's calendar organization patterns
        const userCalendarPatterns = analyzeUserCalendarPatterns(events);
        
        // Convert category time settings to a format that's easier for Gemini to understand
        const formattedSettings: Record<string, any> = {};
        
        for (const [category, settings] of Object.entries(categoryTimeSettings)) {
          formattedSettings[category] = {
            preferredDays: settings.preferredDays,
            timeSlots: {},
            focusTime: true, // Default consider as focus time
            bufferBefore: 15, // Add buffer before important events
            bufferAfter: 15, // Add buffer after important events
          };
          
          // Convert time slots
          for (const [day, slots] of Object.entries(settings.timeSlots || {})) {
            if (slots && slots.length > 0) {
              formattedSettings[category].timeSlots[day] = slots.map(slot => ({
                start: slot.startHour,
                end: slot.endHour,
                productivity: calculateProductivityScore(slot.startHour, slot.endHour, userCalendarPatterns)
              }));
            }
          }
        }
        
        // Convert events for Gemini to understand
        const formattedEvents = events.map(event => ({
          id: event.id,
          title: event.title || 'Untitled',
          description: event.description,
          category: event.metadata?.category || 'Work',
          priority: event.priority || 'medium',
          isFixed: event.locked || event.priority === 'high',
          duration: getDurationInMinutes(event),
          currentStart: new Date(event.start_at).toISOString(),
          currentEnd: new Date(event.end_at).toISOString(),
          originalDay: new Date(event.start_at).toLocaleDateString(),
          deadline: event.metadata?.deadline || null,
          isRecurring: Boolean(event.metadata?.recurrence),
          timePreference: event.metadata?.timePreference || null, // Add preferred time option if available
          energyLevel: calculateRequiredEnergyLevel(event) // Energy level required for the event
        }));
        
        // Create prompt for Gemini
        const prompt = `
You are Reclaim AI, an advanced intelligent calendar assistant that perfectly balances work and life. Your task is to optimize users' schedules to maximize productivity and well-being.

# Calendar Input:
- Time period: ${startDate.toISOString()} to ${endDate.toISOString()}
- Working hours: ${workingHours.start}:00 to ${workingHours.end}:00
- Number of events: ${events.length} (${fixedEvents.length} fixed, ${eventsToReschedule.length} to reschedule)
- User patterns: ${JSON.stringify(userCalendarPatterns, null, 2)}

# Category Settings (with preferred times):
${JSON.stringify(formattedSettings, null, 2)}

# Events to reschedule:
${JSON.stringify(eventsToReschedule.map(e => ({
  id: e.id,
  title: e.title,
  category: e.metadata?.category || 'Work',
  priority: e.priority || 'medium',
  duration: getDurationInMinutes(e),
  currentStart: new Date(e.start_at).toISOString(),
  originalDay: new Date(e.start_at).toLocaleDateString(),
  deadline: e.metadata?.deadline || null
})), null, 2)}

# Fixed events (for reference - do not reschedule these):
${JSON.stringify(fixedEvents.map(e => ({
  id: e.id,
  title: e.title,
  start: new Date(e.start_at).toISOString(),
  end: new Date(e.end_at).toISOString()
})), null, 2)}

# Reclaim AI Scheduling Algorithm Rules:
1. Try to keep events on their original day when possible
2. If an event cannot fit on its original day, intelligently move it to the next available day with suitable time slots
3. Apply "Task Batching" - group similar categories of work together when possible
4. Honor the "Biological Prime Time" - schedule high-energy tasks during user's peak productivity hours
5. Place "Deep Work" activities in longer uninterrupted blocks, preferably morning
6. Schedule buffer time between meetings (15-30 minutes) to prevent back-to-back fatigue
7. Prioritize events in order: Critical (P1) > High (P2) > Medium (P3) > Low (P4)
8. Place longer duration events earlier in the day when possible
9. Ensure work-life balance by properly distributing work and personal events
10. For tasks with deadlines, prioritize those with closer due dates
11. Leave some "flexible slack" in the schedule for unexpected work
12. Use the 52/17 rule: aim for focused 52-minute work blocks followed by 17-minute breaks
13. Protect focus time by grouping meetings together rather than spreading them throughout day
14. If a time slot has multiple candidates, place the event with higher "energy required" during higher productivity periods
15. Events with deadlines should be scheduled earlier to provide buffer for unexpected delays
16. Consider the context switching cost when scheduling different categories back-to-back

# Output Format:
Return a JSON array of rescheduled events, using this exact format:
[
  {
    "id": "event1",
    "newStart": "2023-08-01T09:00:00.000Z", 
    "newEnd": "2023-08-01T10:00:00.000Z",
    "changed": true,
    "reason": "Scheduled during morning focus time for optimal productivity"
  },
  {
    "id": "event2",
    "newStart": "2023-08-01T14:00:00.000Z",
    "newEnd": "2023-08-01T15:30:00.000Z", 
    "changed": true,
    "reason": "Grouped with other meetings to protect focus time"
  }
]

You MUST return ONLY the JSON array with no additional text or explanation.
`;

        console.log('📝 Sending prompt to Gemini...');
        
        // Call Gemini API
        const response = await callGeminiAPI(prompt, apiKey);
        
        if (!response || !response.candidates || response.candidates.length === 0) {
          console.error('❌ No response from Gemini API');
          return events;
        }
        
        // Get results from Gemini
        const responseText = response.candidates[0].content.parts[0].text;
        console.log('✅ Received response from Gemini:', responseText.substring(0, 100) + '...');
        
        // Parse JSON results
        let scheduledEventsData;
        try {
          // Filter out any non-JSON content
          const jsonString = responseText.replace(/^```json\n|\n```$/g, '').trim();
          scheduledEventsData = JSON.parse(jsonString);
          
          if (!Array.isArray(scheduledEventsData)) {
            throw new Error('Expected array, got ' + typeof scheduledEventsData);
          }
        } catch (error) {
          console.error('❌ Failed to parse Gemini response as JSON:', error);
          console.log('Raw response:', responseText);
          return events;
        }
        
        console.log('📊 Parsed scheduled events:', scheduledEventsData);
        
        // Update times for events
        const result = events.map(event => {
          const scheduledEvent = scheduledEventsData.find(e => e.id === event.id);
          
          if (scheduledEvent && scheduledEvent.changed) {
            console.log(`🔄 Updating event "${event.title}" from ${new Date(event.start_at).toLocaleString()} to ${new Date(scheduledEvent.newStart).toLocaleString()}`);
            console.log(`   Reason: ${scheduledEvent.reason || 'Optimized scheduling'}`);
            
            return {
          ...event,
              start_at: scheduledEvent.newStart,
              end_at: scheduledEvent.newEnd,
              metadata: {
                ...event.metadata,
                last_scheduled: new Date().toISOString(),
                scheduled_by: 'reclaim',
                scheduling_reason: scheduledEvent.reason || 'Optimized scheduling'
              }
            };
          }
          
          return event;
        });
        
        console.log('✅ Scheduling complete.');
        return result;
      } catch (error) {
        console.error('❌ Error in smartScheduleWithGemini:', error);
        return events;
      }
    },
    [getDurationInMinutes, getPriorityValue]
  );
  
  // Hàm phụ trợ để phân tích mẫu lịch của người dùng
  const analyzeUserCalendarPatterns = (events: CalendarEvent[]) => {
    // Tạo mẫu giả để minh họa, trong thực tế sẽ phân tích sự kiện thực
    const productiveHours = {
      morning: true, // Người dùng có xu hướng năng suất vào buổi sáng
      afternoon: false,
      evening: false
    };
    
    const meetingPreference = {
      preferredDays: ['Monday', 'Wednesday', 'Thursday'],
      preferredTimes: ['10:00', '14:00', '16:00']
    };
    
    return {
      productiveHours,
      meetingPreference,
      averageMeetingDuration: 45, // phút
      breakFrequency: 'medium', // low, medium, high
      workStartTime: '09:00', 
      workEndTime: '18:00'
    };
  };
  
  // Hàm tính toán điểm năng suất dựa trên khung giờ và mẫu người dùng
  const calculateProductivityScore = (
    startHour: number, 
    endHour: number, 
    userPatterns: any
  ): number => {
    // Logic mẫu để đánh giá khung giờ dựa trên mẫu người dùng
    if (startHour >= 8 && startHour <= 11 && userPatterns.productiveHours.morning) {
      return 10; // Điểm cao cho buổi sáng nếu người dùng năng suất vào buổi sáng
    } else if (startHour >= 14 && startHour <= 16 && userPatterns.productiveHours.afternoon) {
      return 8; // Điểm khá cao cho buổi chiều nếu người dùng năng suất vào buổi chiều
    } else if (startHour >= 17) {
      return 3; // Điểm thấp cho buổi tối
    } else {
      return 5; // Điểm trung bình cho các khung giờ khác
    }
  };
  
  // Hàm tính toán mức năng lượng cần thiết cho sự kiện
  const calculateRequiredEnergyLevel = (event: CalendarEvent): 'high' | 'medium' | 'low' => {
    // Xác định mức năng lượng dựa trên loại sự kiện, thời lượng, và các thuộc tính khác
    const duration = getDurationInMinutes(event);
    const priority = event.priority || 'medium';
    const hasKeywords = (event.title || '').match(/(meeting|presentation|interview|review)/i);
    
    if (priority === 'high' || duration > 60 || (event.title || '').includes('presentation')) {
      return 'high';
    } else if (priority === 'medium' || hasKeywords || duration > 30) {
      return 'medium';
    } else {
      return 'low';
    }
  };

  // Cập nhật hàm rescheduleEvents để sử dụng Gemini nếu có API key
  const rescheduleEvents = useCallback(async (startDate?: Date, endDate?: Date, viewMode: 'day' | '4-days' | 'week' | 'month' = 'week') => {
    console.log("🔍 rescheduleEvents called with:", { startDate, endDate, viewMode });
    
    if (!ws?.id) {
      console.error("❌ No workspace ID, cannot schedule");
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
    
    console.log("📅 Time period to schedule:", {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString()
    });
    
    // Get all events in the selected time period
    const allEvents = events.filter((event: CalendarEvent) => {
      const eventStart = new Date(event.start_at);
      return eventStart >= periodStart && eventStart <= periodEnd;
    });
    
    console.log(`📋 Found ${allEvents.length} events in the selected time period`);
    
    // Check if Gemini API key is available
    const geminiApiKey = settings?.smartScheduling?.geminiApiKey;
    
    // Get the user's category time settings
    let userCategoryTimeSettings = settings?.smartScheduling?.categoryTimeSettings || {};
    
    // Ensure the time settings are in the new format with timeSlots
    userCategoryTimeSettings = migrateTimeSettings(userCategoryTimeSettings);
    
    if (Object.keys(userCategoryTimeSettings).length === 0) {
      console.log('⚠️ No category time settings found, using default ones');
      
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
        // Other categories remain unchanged
      };
      
      console.log('📝 Default settings created:', defaultTimeSettings);
      
      // Save these default settings for future use
      try {
        updateSettings({
          smartScheduling: {
            ...settings.smartScheduling,
            categoryTimeSettings: defaultTimeSettings
          }
        });
        console.log('✅ Default settings saved to settings');
      } catch (error) {
        console.error('❌ Error saving default settings:', error);
      }
      
      userCategoryTimeSettings = defaultTimeSettings;
    }
    
    // Log the settings for debugging
    console.log('Category time settings:', JSON.stringify(userCategoryTimeSettings, null, 2));
    
    try {
      let result;
      
      // First, make sure we only schedule unlocked events
      const fixedEvents = allEvents.filter(
        (event: CalendarEvent) => event.locked
      );
      
      // Events that can be rescheduled (all non-locked events)
      const rescheduleableEvents = allEvents.filter(
        (event: CalendarEvent) => !event.locked
      );
      
      console.log(`🔒 Fixed events: ${fixedEvents.length}, Reschedulable events: ${rescheduleableEvents.length}`);
      
      if (geminiApiKey) {
        // Use Gemini for scheduling
        console.log('🤖 Using Gemini for smart scheduling');
        result = await smartScheduleWithGemini(
          allEvents,
          periodStart,
          periodEnd,
          geminiApiKey,
          userCategoryTimeSettings
        );
      } else {
        // Try using Gemini API with environment variable if user doesn't have API key
        console.log('🔍 Checking for environment variable API key');
        try {
          result = await smartScheduleWithGemini(
            allEvents,
            periodStart,
            periodEnd,
            undefined, // Pass undefined to use environment variable
            userCategoryTimeSettings
          );
        } catch (error) {
          console.log('⚠️ Could not use environment variable for API key:', error);
          console.log('⚙️ Falling back to built-in algorithm for scheduling');
          const rescheduledEvents = await enhancedRescheduleEvents(
            rescheduleableEvents,
            periodStart,
            periodEnd,
            userCategoryTimeSettings
          );
          
          // Combine fixed events with rescheduled events
          result = [...fixedEvents, ...rescheduledEvents];
        }
      }
      
      console.log(`✅ Scheduling complete with ${result.length} events`);
    
      // Save the time changes to database
      const originalEventMap = new Map(allEvents.map((e: CalendarEvent) => [e.id, e]));
      const updatePromises = [];

      for (const newEvent of result) {
        const originalEvent = originalEventMap.get(newEvent.id) as CalendarEvent | undefined;
        
        // Check if the event has a new time
        if (originalEvent && 
           (originalEvent.start_at !== newEvent.start_at || 
            originalEvent.end_at !== newEvent.end_at)) {
          
          console.log(`💾 Saving updated event: ${newEvent.title}`);
          console.log(`   From: ${new Date(originalEvent.start_at).toLocaleString()} → ${new Date(newEvent.start_at).toLocaleString()}`);
          
          // Update event with new time from Gemini
          updatePromises.push(updateEvent(newEvent.id, {
            start_at: newEvent.start_at,
            end_at: newEvent.end_at,
            metadata: {
              ...(originalEvent.metadata || {}),
              last_scheduled: new Date().toISOString(),
              original_start: originalEvent.start_at,
              original_end: originalEvent.end_at,
              scheduled_by: 'gemini',
              scheduling_reason: newEvent.metadata?.scheduling_reason || 'Optimized by Smart Scheduler'
            }
          }));
        }
      }

      // Wait for all updates to complete before refreshing
      if (updatePromises.length > 0) {
        console.log(`⏳ Saving ${updatePromises.length} updated events...`);
        await Promise.all(updatePromises);
        console.log('✅ All events saved successfully');
      } else {
        console.log('ℹ️ No events need updating');
      }

      // Refresh the calendar
      refresh();
    
      return result;
    } catch (error) {
      console.error('❌ Error in scheduling:', error);
      return allEvents; // Return original events in case of error
    }
  }, [events, ws?.id, settings, refresh, enhancedRescheduleEvents, smartScheduleWithGemini, updateSettings, updateEvent]);

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

// Helper function to get day of week
function getDayOfWeek(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()] || 'monday'; // Fallback to monday if undefined
}