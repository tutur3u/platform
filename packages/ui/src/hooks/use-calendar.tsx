import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import {
  type CalendarSettings,
  defaultCalendarSettings,
} from '@tuturuuu/ui/legacy/calendar/settings/settings-context';
import dayjs from 'dayjs';
import moment from 'moment';
import { useCalendarSync } from './use-calendar-sync';
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

// Function to create a unique signature for an event based on its content
const createEventSignature = (event: CalendarEvent): string => {
  return `${event.title}|${event.description || ''}|${event.start_at}|${event.end_at}`;
};

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
  addEmptyEvent: (date: Date) => CalendarEvent;
  addEmptyEventWithDuration: (startDate: Date, endDate: Date) => CalendarEvent;
  updateEvent: (
    eventId: string,
    data: Partial<CalendarEvent>
  ) => Promise<CalendarEvent | undefined>;
  deleteEvent: (eventId: string) => Promise<void>;
  isModalOpen: boolean;
  activeEvent: CalendarEvent | undefined;
  openModal: (eventId?: string, modalType?: 'all-day' | 'event') => void;
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

  settings: CalendarSettings;
  updateSettings: (settings: Partial<CalendarSettings>) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
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
  openModal: () => undefined,
  closeModal: () => undefined,
  isEditing: () => false,
  hideModal: () => undefined,
  showModal: () => undefined,
  getModalStatus: () => false,
  getActiveEvent: () => undefined,
  isModalActive: () => false,
  // Google Calendar API
  syncGoogleCalendarNow: () => Promise.resolve(false),

  settings: defaultCalendarSettings,
  updateSettings: () => undefined,
  isDragging: false,
  setIsDragging: () => undefined,
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
  experimentalGoogleToken,
}: {
  ws?: Workspace;
  useQuery: any;
  useQueryClient: any;
  children: ReactNode;
  initialSettings?: Partial<CalendarSettings>;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
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
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return null;
    }
    
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
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
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

  const { events, refresh } = useCalendarSync();

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

        // Check if this is an all-day event using is_all_day flag or fallback to midnight check
        const isAllDayEvent = e.is_all_day ?? (
          !(eventStart.getHours() || eventStart.getMinutes() || eventStart.getSeconds() || eventStart.getMilliseconds()) &&
          !(eventEnd.getHours() || eventEnd.getMinutes() || eventEnd.getSeconds() || eventEnd.getMilliseconds())
        );

        // For all-day events, treat end date as exclusive (consistent with week view)
        // For timed events, treat end date as inclusive
        if (isAllDayEvent) {
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
      ) as number[];

      return Math.max(...prevEventLevels) + 1;
    },
    [events]
  );

  // CRUD operations with Supabase
  const addEvent = useCallback(
    async (event: Omit<CalendarEvent, 'id'>) => {
      if (!ws) throw new Error('No workspace selected');

      console.log('Adding event:', event);

      try {
        const supabase = createClient();

        // Round start and end times to nearest 15-minute interval
        const startDate = roundToNearest15Minutes(new Date(event.start_at));
        const endDate = roundToNearest15Minutes(new Date(event.end_at));

        const eventColor = event.color || 'BLUE';

        // Create an event signature to check for duplicates
        const newEventSignature = `${event.title || ''}|${event.description || ''}|${startDate.toISOString()}|${endDate.toISOString()}`;

        // Check existing events for potential duplicates to prevent race condition
        const duplicates = events.filter((e: CalendarEvent) => {
          const existingSignature = createEventSignature(e);
          return existingSignature === newEventSignature;
        });

        // If duplicates already exist, return the first one
        if (duplicates.length > 0) {
          console.log(
            'Prevented duplicate event creation - matching event already exists'
          );

          // Clear any pending new event
          setPendingNewEvent(null);

          // Return the existing event
          return duplicates[0];
        }

        // No duplicates, proceed with creating the event
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
            ws_id: ws?.id ?? '',
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
    [ws, refresh, settings.categoryColors, events]
  );

  const addEmptyEvent = useCallback(
    (date: Date) => {
      // TOD0: Fix this weird workaround in the future
      const selectedDate = dayjs(date);

      // Round to nearest 15-minute interval
      const start_at = roundToNearest15Minutes(selectedDate.toDate());
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

  const addEmptyEventWithDuration = useCallback(
    (startDate: Date, endDate: Date) => {
      // Round start and end times to nearest 15-minute interval
      const roundedStartDate = roundToNearest15Minutes(startDate);
      const roundedEndDate = roundToNearest15Minutes(endDate);

      // Use default color from settings
      const defaultColor =
        settings.categoryColors.categories[0]?.color || 'BLUE';

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

      // Store the pending new event
      setPendingNewEvent(newEvent);
      setActiveEventId('new');

      // Open the modal with the pending event
      setModalHidden(false);

      // Return the pending event object
      return newEvent as CalendarEvent;
    },
    [ws?.id, settings.categoryColors]
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
          // Check for potential duplicates before creating a new event
          if (updatedEvent.title || pendingNewEvent.title) {
            const startDate = roundToNearest15Minutes(
              new Date(newEventData.start_at || new Date())
            );
            const endDate = roundToNearest15Minutes(
              new Date(newEventData.end_at || new Date())
            );

            const newEventSignature = `${newEventData.title || ''}|${newEventData.description || ''}|${startDate.toISOString()}|${endDate.toISOString()}`;

            // Check existing events for potential duplicates
            const duplicates = events.filter((e: CalendarEvent) => {
              const existingSignature = createEventSignature(e);
              return existingSignature === newEventSignature;
            });

            // If duplicates already exist, return the first one
            if (duplicates.length > 0) {
              console.log(
                'Prevented duplicate event creation during update - matching event already exists'
              );

              // Clear any pending new event
              setPendingNewEvent(null);

              // Return the existing event
              return duplicates[0];
            }
          }

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
    [ws, processUpdateQueue, pendingNewEvent, addEvent, events]
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
      if (googleCalendarEventId && experimentalGoogleToken) {
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
      } else if (experimentalGoogleToken && !googleCalendarEventId) {
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

  // Automatically fetch Google Calendar events
  const fetchGoogleCalendarEvents = async () => {
    if (!ws?.id) {
      throw new Error('No workspace selected');
    }
    const response = await fetch(`/api/v1/calendar/auth/fetch?wsId=${ws.id}`);
    if (!response.ok) {
      throw new Error('Failed to fetch Google Calendar events');
    }
    return await response.json();
  };

  // Query to fetch Google Calendar events every 1 hour
  const { data: googleData } = useQuery({
    queryKey: ['googleCalendarEvents', ws?.id],
    queryFn: fetchGoogleCalendarEvents,
    enabled: !!ws?.id && !!experimentalGoogleToken?.id,
    refetchInterval: 1000 * 60 * 60, // Fetch every 1 hour
    staleTime: 1000 * 60 * 60, // Data is considered fresh for 1 hour
  });

  const googleEvents = useMemo(() => googleData?.events || [], [googleData]);

  const getGoogleEvents = useCallback(() => googleEvents, [googleEvents]);

  // Function to synchronize local events with Google Calendar
  const syncEvents = useCallback(
    async (
      progressCallback?: (progress: {
        phase: 'delete' | 'update' | 'insert' | 'complete';
        current: number;
        total: number;
        changesMade: boolean;
      }) => void
    ) => {
      if (!googleEvents.length || !experimentalGoogleToken) return;

      // Get local events that are synced with Google Calendar
      const localGoogleEvents: CalendarEvent[] = events.filter(
        (e: CalendarEvent) => e.google_event_id
      );

      // Create a map for faster lookups of local events
      const localEventMap = new Map<string, CalendarEvent>();
      localGoogleEvents.forEach((event) => {
        if (event.google_event_id) {
          localEventMap.set(event.google_event_id, event);
        }
      });

      // Create a set of google_event_id from Google Calendar events for quick lookup
      const googleEventIds: Set<string | undefined> = new Set(
        googleEvents.map((e: { google_event_id?: string }) => e.google_event_id)
      );

      // Identify events to delete: local events not present in Google Calendar
      const eventsToDelete = localGoogleEvents.filter(
        (e) => e.google_event_id && !googleEventIds.has(e.google_event_id)
      );

      // Initialize batch operations - we'll perform these in a more optimized way
      const eventsToUpdate: Array<{ id: string; data: any }> = [];
      const eventsToInsert: Array<any> = [];
      let changesMade = false;

      // Report initial progress
      if (progressCallback) {
        progressCallback({
          phase: 'delete',
          current: 0,
          total: eventsToDelete.length,
          changesMade: false,
        });
      }

      // Handle events to delete
      if (eventsToDelete.length > 0) {
        changesMade = true;
        const supabase = createClient();

        // Delete events in batches for better performance
        const batchSize = 10;
        for (let i = 0; i < eventsToDelete.length; i += batchSize) {
          const batch = eventsToDelete.slice(i, i + batchSize);
          const eventIds = batch.map((e) => e.id);

          // Report progress
          if (progressCallback) {
            progressCallback({
              phase: 'delete',
              current: i + batch.length,
              total: eventsToDelete.length,
              changesMade: true,
            });
          }

          try {
            const { error } = await supabase
              .from('workspace_calendar_events')
              .delete()
              .in('id', eventIds);

            if (error) {
              console.error('Failed to delete events batch:', error);
            } else {
              console.log(
                `Successfully deleted ${batch.length} events that were removed from Google Calendar`
              );
            }
          } catch (err) {
            console.error('Failed to delete events batch:', err);
          }
        }
      }

      // Gather events to update or insert
      for (const gEvent of googleEvents) {
        // Skip events without google_event_id
        if (!gEvent.google_event_id) continue;

        const localEvent = localEventMap.get(gEvent.google_event_id);

        if (localEvent) {
          // Check if there are any significant changes in the event details that require an update
          const hasChanges =
            localEvent.title !== gEvent.title ||
            localEvent.description !== (gEvent.description || '') ||
            localEvent.start_at !== gEvent.start_at ||
            localEvent.end_at !== gEvent.end_at ||
            localEvent.color !== gEvent.color ||
            localEvent.location !== (gEvent.location || '') ||
            localEvent.priority !== (gEvent.priority || 'medium');

          // Only update if there are actual changes
          if (hasChanges) {
            changesMade = true;
            eventsToUpdate.push({
              id: localEvent.id,
              data: {
                title: gEvent.title,
                description: gEvent.description || '',
                start_at: gEvent.start_at,
                end_at: gEvent.end_at,
                color: gEvent.color || 'BLUE',
                location: gEvent.location || '',
                priority: gEvent.priority || 'medium',
              },
            });
          }
        } else {
          // Check for content-based duplicates before adding
          const potentialDuplicates = events.filter(
            (localEvent: CalendarEvent) => {
              return (
                localEvent.title === gEvent.title &&
                localEvent.description === (gEvent.description || '') &&
                localEvent.start_at === gEvent.start_at &&
                localEvent.end_at === gEvent.end_at
              );
            }
          );

          if (potentialDuplicates.length > 0) {
            console.log(
              `Found content duplicate for Google event "${gEvent.title}"`
            );

            if (potentialDuplicates[0]) {
              changesMade = true;
              // Update the existing event with the Google Event ID rather than creating a new one
              eventsToUpdate.push({
                id: potentialDuplicates[0].id,
                data: {
                  google_event_id: gEvent.google_event_id,
                },
              });
              continue;
            }
          }

          // No duplicates found, add to insert batch
          changesMade = true;
          eventsToInsert.push({
            title: gEvent.title,
            description: gEvent.description || '',
            start_at: gEvent.start_at,
            end_at: gEvent.end_at,
            color: gEvent.color || 'BLUE',
            location: gEvent.location || '',
            ws_id: ws?.id ?? '',
            google_event_id: gEvent.google_event_id,
            locked: gEvent.locked || false,
            priority: gEvent.priority || 'medium',
            created_at: new Date().toISOString(),
          });
        }
      }

      // Process batch updates
      if (eventsToUpdate.length > 0) {
        // Report progress for update phase
        if (progressCallback) {
          progressCallback({
            phase: 'update',
            current: 0,
            total: eventsToUpdate.length,
            changesMade: changesMade,
          });
        }

        const supabase = createClient();
        const batchSize = 5; // Smaller batch size for updates to be safer

        for (let i = 0; i < eventsToUpdate.length; i += batchSize) {
          const batch = eventsToUpdate.slice(i, i + batchSize);

          // Report progress update
          if (progressCallback) {
            progressCallback({
              phase: 'update',
              current: i + batch.length,
              total: eventsToUpdate.length,
              changesMade: changesMade,
            });
          }

          // Process each update one by one to ensure reliability
          for (const item of batch) {
            try {
              // Use upsert with onConflict to handle race conditions
              const { error } = await supabase
                .from('workspace_calendar_events')
                .update(item.data)
                .eq('id', item.id);

              if (error) {
                // If there's an error, try a direct approach
                console.error(
                  `Failed to update event ${item.id}, trying alternative approach:`,
                  error
                );

                // Fallback method - get the current event first
                const { data: currentEvent } = await supabase
                  .from('workspace_calendar_events')
                  .select('*')
                  .eq('id', item.id)
                  .single();

                if (currentEvent) {
                  // Then update it
                  const { error: fallbackError } = await supabase
                    .from('workspace_calendar_events')
                    .update({
                      ...item.data,
                      id: item.id, // Ensure ID is preserved
                    })
                    .eq('id', item.id);

                  if (fallbackError) {
                    console.error(
                      `Failed to update event ${item.id} using fallback:`,
                      fallbackError
                    );
                  } else {
                    console.log(
                      `Successfully updated event ${item.id} using fallback method`
                    );
                  }
                } else {
                  console.error(`Event ${item.id} not found for update`);
                }
              }
            } catch (err) {
              console.error(`Failed to update event ${item.id}:`, err);
            }
          }
        }
      }

      // Process batch inserts
      if (eventsToInsert.length > 0) {
        // Report progress for insert phase
        if (progressCallback) {
          progressCallback({
            phase: 'insert',
            current: 0,
            total: eventsToInsert.length,
            changesMade: changesMade,
          });
        }

        const supabase = createClient();
        const batchSize = 10;

        for (let i = 0; i < eventsToInsert.length; i += batchSize) {
          const batch = eventsToInsert.slice(i, i + batchSize);

          // Report progress update
          if (progressCallback) {
            progressCallback({
              phase: 'insert',
              current: i + batch.length,
              total: eventsToInsert.length,
              changesMade: changesMade,
            });
          }

          try {
            const { error } = await supabase
              .from('workspace_calendar_events')
              .insert(batch);

            if (error) {
              console.error('Failed to insert events batch:', error);

              // Try inserting one by one as fallback
              for (const event of batch) {
                try {
                  const { error: singleError } = await supabase
                    .from('workspace_calendar_events')
                    .insert(event);

                  if (singleError) {
                    console.error(
                      `Failed to insert single event:`,
                      singleError
                    );
                  } else {
                    console.log(`Successfully inserted single event`);
                  }
                } catch (singleErr) {
                  console.error('Failed to insert single event:', singleErr);
                }
              }
            } else {
              console.log(
                `Successfully inserted ${batch.length} new events from Google Calendar`
              );
            }
          } catch (err) {
            console.error('Failed to insert events batch:', err);
          }
        }
      }

      // Report completion
      if (progressCallback) {
        progressCallback({
          phase: 'complete',
          current: 1,
          total: 1,
          changesMade: changesMade,
        });
      }

      // Only refresh local events if changes were made
      if (changesMade) {
        console.log(
          'Google Calendar sync: Changes detected, refreshing events'
        );
        queryClient.invalidateQueries(['calendarEvents', ws?.id]);
      } else {
        console.log(
          'Google Calendar sync: No changes detected, skipping refresh'
        );
      }
    },
    [googleEvents, events, ws?.id, queryClient]
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
      if (!experimentalGoogleToken || !ws?.id) {
        console.log(
          'Cannot sync: Google Calendar integration not enabled or missing token'
        );
        return false;
      }

      try {
        console.log('Starting manual Google Calendar sync');

        // First, capture current events count for comparison
        const beforeCount = events.length;
        const beforeGoogleCount = googleEvents.length;

        // Report fetch starting
        if (progressCallback) {
          progressCallback({
            phase: 'fetch',
            current: 0,
            total: 1,
            changesMade: false,
            statusMessage: 'Fetching events from Google Calendar...',
          });
        }

        // Force fetch the latest events from Google with a cache-busting parameter
        try {
          const response = await fetch(
            `/api/v1/calendar/auth/fetch?wsId=${ws.id}&force=true&t=${Date.now()}`
          );
          const data = await response.json();

          if (!response.ok) {
            // Include the full error details from Google API
            const errorDetails = data.error || response.statusText;
            const statusCode = response.status;
            const googleError = data.googleError || data.details || '';
            throw new Error(
              `Failed to fetch Google Calendar events: ${errorDetails} (${statusCode})${googleError ? ` - Google API: ${googleError}` : ''}`
            );
          }

          // Update googleEvents directly through queryClient for faster UI response
          queryClient.setQueryData(['googleCalendarEvents', ws?.id], data);

          console.log(
            `Fetched ${data.events?.length || 0} events from Google Calendar`
          );

          // Report fetch complete
          if (progressCallback) {
            progressCallback({
              phase: 'fetch',
              current: 1,
              total: 1,
              changesMade: data.events?.length !== beforeGoogleCount,
              statusMessage: `Fetched ${data.events?.length || 0} events from Google Calendar`,
            });
          }
        } catch (fetchError) {
          console.error('Error fetching Google Calendar events:', fetchError);

          if (progressCallback) {
            progressCallback({
              phase: 'fetch',
              current: 0,
              total: 1,
              changesMade: false,
              statusMessage:
                fetchError instanceof Error
                  ? fetchError.message
                  : 'Failed to fetch events from Google Calendar',
            });
          }

          // Propagate the error instead of returning false
          throw fetchError;
        }

        // Manually run the sync process with progress tracking
        let changesMade = false;
        await syncEvents((progress) => {
          if (progressCallback) {
            // Forward the progress updates
            progressCallback({
              ...progress,
              statusMessage:
                progress.phase === 'delete'
                  ? `Removing ${progress.total} deleted events (${progress.current}/${progress.total})`
                  : progress.phase === 'update'
                    ? `Updating ${progress.total} events (${progress.current}/${progress.total})`
                    : progress.phase === 'insert'
                      ? `Adding ${progress.total} new events (${progress.current}/${progress.total})`
                      : progress.phase === 'complete'
                        ? 'Sync completed'
                        : undefined,
            });
          }

          // Track if any changes were made
          if (progress.changesMade) {
            changesMade = true;
          }
        });

        // Force refresh of local events
        if (changesMade) {
          if (progressCallback) {
            progressCallback({
              phase: 'complete',
              current: 1,
              total: 1,
              changesMade: true,
              statusMessage: 'Refreshing your calendar...',
            });
          }

          await queryClient.invalidateQueries({
            queryKey: ['calendarEvents', ws?.id],
            refetchType: 'all',
          });
        }

        // Calculate changes
        const afterCount = getEvents().length;
        const countDifference = afterCount - beforeCount;

        console.log(
          `Google Calendar sync complete. Events count changed by ${countDifference}`
        );

        // Final callback with summary
        if (progressCallback) {
          progressCallback({
            phase: 'complete',
            current: 1,
            total: 1,
            changesMade: changesMade,
            statusMessage: changesMade
              ? `Sync complete. ${Math.abs(countDifference)} events ${countDifference >= 0 ? 'added' : 'removed'}.`
              : 'Sync complete. No changes needed.',
          });
        }

        // Return success with indication if changes were made
        return changesMade || beforeGoogleCount !== googleEvents.length;
      } catch (error) {
        console.error('Manual Google Calendar sync failed:', error);

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
    [
      experimentalGoogleToken,
      ws?.id,
      events.length,
      googleEvents.length,
      queryClient,
      syncEvents,
      getEvents,
    ]
  );

  const [isDragging, setIsDragging] = useState(false);

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
    syncGoogleCalendarNow,

    // Settings API
    settings,
    updateSettings,

    isDragging,
    setIsDragging,
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
