import { toast } from '../components/ui/sonner';
import { createAllDayEvent, isAllDayEvent } from './calendar-utils';
import { useCalendarSync } from './use-calendar-sync';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import moment from 'moment';
import 'moment/locale/vi';
import {
  type ReactNode,
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
  addEmptyEvent: (date: Date, isAllDay?: boolean) => CalendarEvent;
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
  experimentalGoogleToken,
}: {
  ws?: Workspace;
  useQuery: any;
  useQueryClient: any;
  children: ReactNode;
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
    },
    [ws, refresh, events]
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

      // Check if the event exists before trying to update
      const existingEvent = events.find((e: CalendarEvent) => e.id === eventId);
      if (!existingEvent) {
        const errorMsg = `Event with ID ${eventId} not found in local events`;
        if (_reject) {
          _reject(new Error(errorMsg));
        }
        return;
      }

      // Validate workspace ownership
      if (existingEvent.ws_id !== ws?.id) {
        const errorMsg = `Event ${eventId} does not belong to current workspace (${ws?.id})`;
        if (_reject) {
          _reject(new Error(errorMsg));
        }
        return;
      }

      try {
        // Perform the actual update
        const supabase = createClient();

        // Clean up the update data to ensure no undefined values and exclude system fields
        const cleanUpdateData: any = {
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
        };

        // Remove system fields that shouldn't be updated (just in case they're present)
        delete cleanUpdateData.id;
        delete cleanUpdateData.ws_id;
        delete cleanUpdateData.google_event_id;

        const { data, error } = await supabase
          .from('workspace_calendar_events')
          .update(cleanUpdateData)
          .eq('id', eventId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        // Refresh the query cache after updating an event
        refresh();

        if (data) {
          // Resolve the promise for this update
          if (_resolve) {
            _resolve(data as CalendarEvent);
          }
        } else {
          if (_reject) {
            _reject(
              new Error(`Failed to update event ${eventId} - no data returned`)
            );
          }
        }
      } catch (err) {
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
  }, [refresh, events, ws?.id]);

  const updateEvent = useCallback(
    async (eventId: string, eventUpdates: Partial<CalendarEvent>) => {
      if (!ws) throw new Error('No workspace selected');

      // Clean and validate the event updates - only allow known CalendarEvent fields
      const allowedFields: (keyof CalendarEvent)[] = [
        'title',
        'description',
        'start_at',
        'end_at',
        'color',
        'location',
        'locked',
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

      // If this is a newly created event that hasn't been saved to the database yet
      if (pendingNewEvent && eventId === 'new') {
        const newEventData = {
          ...pendingNewEvent,
          ...cleanedUpdates,
        };
        // Check for potential duplicates before creating a new event
        if (cleanedUpdates.title || pendingNewEvent.title) {
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
      }

      // Generate a unique update ID to track this specific update request
      const updateId = `${eventId}-${Date.now()}`;
      const timestamp = Date.now();

      // Create a promise that will resolve when the update is actually performed
      return new Promise<CalendarEvent>((resolve, reject) => {
        // Create the update object with the promise callbacks
        const updateObject: PendingEventUpdate = {
          ...cleanedUpdates,
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
              // Notify user to re-authenticate with Google Calendar
              toast.error('Google Calendar authentication expired', {
                description:
                  'Please re-authenticate your Google Calendar connection to continue syncing events.',
                action: {
                  label: 'Re-authenticate',
                  onClick: () => {
                    // Redirect to Google Calendar auth page or open auth modal
                    // This could be enhanced to open a specific auth flow
                    window.open(
                      '/api/v1/calendar/auth?wsId=' + ws?.id,
                      '_blank'
                    );
                  },
                },
              });
              // Continue with local delete - don't block user action
              console.warn(
                'Google Calendar re-authentication required, proceeding with local delete'
              );
            } else {
              // Throw an error to potentially stop the local delete or notify user
              throw new Error(
                `Google Calendar sync (DELETE) failed: ${syncResponse.statusText} - ${JSON.stringify(errorData)}`
              );
            }
          }
        } catch (_) {
          // Failed to sync delete with Google Calendar
        }
      } else if (experimentalGoogleToken && !googleCalendarEventId) {
        // Event has no Google Calendar ID, skipping delete sync
      }

      const supabase = createClient();
      const { error } = await supabase
        .from('workspace_calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;

      // Refresh the query cache after deleting an event
      refresh();
      setActiveEventId(null);
    },
    [ws, refresh, pendingNewEvent, events, experimentalGoogleToken]
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
              // Failed to delete events batch
            }
          } catch (_) {
            // Failed to delete events batch
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
            localEvent.location !== (gEvent.location || '');

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
                    // Failed to update event using fallback
                  }
                }
              }
            } catch (_) {
              // Failed to update event
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
              // Try inserting one by one as fallback
              for (const event of batch) {
                try {
                  const { error: singleError } = await supabase
                    .from('workspace_calendar_events')
                    .insert(event);

                  if (singleError) {
                    // Failed to insert single event
                  }
                } catch (_) {
                  // Failed to insert single event
                }
              }
            }
          } catch (_) {
            // Failed to insert events batch
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
        queryClient.invalidateQueries(['calendarEvents', ws?.id]);
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
        return false;
      }

      try {
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
