'use client';

import { useCalendar } from '../../../../hooks/use-calendar';
import { Alert, AlertDescription, AlertTitle } from '../../alert';
import {
  COLOR_OPTIONS,
  DateError,
  EventColorPicker,
  EventDateTimePicker,
  EventDescriptionInput,
  EventLocationInput,
  EventTitleInput,
  EventToggleSwitch,
  OverlapWarning,
} from './EventFormComponents';
import { zodResolver } from '@hookform/resolvers/zod';
import { calendarEventSchema } from '@tuturuuu/ai/calendar/events';
import { calendarEventsSchema } from '@tuturuuu/ai/calendar/events';
import { useObject } from '@tuturuuu/ai/object/core';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import {
  CalendarEvent,
  EventPriority,
} from '@tuturuuu/types/primitives/calendar-event';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { format } from 'date-fns';
import { OAuth2Client } from 'google-auth-library';
import {
  AlertCircle,
  Brain,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cog,
  FileText,
  Info,
  Loader2,
  MapPin,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';

interface ExtendedCalendarEvent extends CalendarEvent {
  _originalId?: string;
  _isMultiDay?: boolean;
  _dayPosition?: 'start' | 'middle' | 'end';
}

// Form schema for AI event generation
const AIFormSchema = z.object({
  prompt: z.string().min(1, 'Please enter a prompt to generate an event'),
  timezone: z
    .string()
    .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  smart_scheduling: z.boolean().default(true),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

export function UnifiedEventModal() {
  const { toast } = useToast();

  const {
    activeEvent,
    isModalOpen,
    closeModal,
    addEvent,
    updateEvent,
    deleteEvent,
    getEvents,
    syncWithGoogleCalendar,
  } = useCalendar();

  const [isGoogleAuthenticating, setIsGoogleAuthenticating] = useState(false);

  const handleGoogleAuth = async () => {
    setIsGoogleAuthenticating(true);
    try {
      const response = await fetch('/api/v1/calendar/auth', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Google auth:', error);
      toast({
        title: 'Error',
        description: 'Failed to initiate Google authentication',
        variant: 'destructive',
      });
      setIsGoogleAuthenticating(false);
    }
  };

  const handleSyncWithGoogle = async () => {
    if (!activeEvent) return;
    try {
      await syncWithGoogleCalendar(activeEvent);
      toast({
        title: 'Success',
        description: 'Event synced with Google Calendar',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sync with Google Calendar',
        variant: 'destructive',
      });
    }
  };

  // State for manual event creation/editing
  const [event, setEvent] = useState<Partial<CalendarEvent>>({
    title: '',
    description: '',
    start_at: new Date().toISOString(),
    end_at: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString(), // Default to 1 hour
    color: 'BLUE',
    location: '',
    priority: 'medium',
  });

  // State for AI event generation
  const [generatedEvents, setGeneratedEvents] = useState<any[]>([]);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [userTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Get the current event being previewed
  const generatedEvent = generatedEvents[currentEventIndex];

  // Determine if we're editing an existing event
  const isEditing = activeEvent?.id && activeEvent.id !== 'new';

  // Shared state
  const [activeTab, setActiveTab] = useState<'manual' | 'ai' | 'preview'>(
    isEditing ? 'manual' : 'ai' // Default to AI for new events
  );
  const [isAllDay, setIsAllDay] = useState(false);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [overlappingEvents, setOverlappingEvents] = useState<CalendarEvent[]>(
    []
  );
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  // AI form
  const aiForm = useForm<z.infer<typeof AIFormSchema>>({
    resolver: zodResolver(AIFormSchema),
    defaultValues: {
      prompt: '',
      timezone: userTimezone,
      smart_scheduling: true,
      priority: 'medium',
    },
  });

  // AI generation
  const { object, submit, error, isLoading } = useObject({
    api: '/api/v1/calendar/events/generate',
    schema: calendarEventsSchema,
  });

  // Handle AI-generated events
  useEffect(() => {
    if (object && !isLoading) {
      // Process the generated events
      const processedEvents = Array.isArray(object) ? object : [object];

      const formattedEvents = processedEvents
        .map((event) => {
          if (!event) return null;
          return {
            ...event,
            color:
              event.color && typeof event.color === 'string'
                ? (event.color.toString().toUpperCase() as SupportedColor)
                : 'BLUE',
          };
        })
        .filter((event): event is NonNullable<typeof event> => event !== null);

      setGeneratedEvents(formattedEvents);
      setCurrentEventIndex(0);

      // Find overlapping events for the first event
      if (formattedEvents.length > 0 && aiForm.getValues().smart_scheduling) {
        const firstEvent = formattedEvents[0];
        if (firstEvent && firstEvent.start_at && firstEvent.end_at) {
          checkForOverlaps(firstEvent as Partial<CalendarEvent>);
        }
      }

      setActiveTab('preview');
    }
  }, [object, isLoading]);

  // Reset form when modal opens/closes or active event changes
  useEffect(() => {
    if (activeEvent) {
      // Handle IDs for split multi-day events (they contain a dash and date)
      const originalId = activeEvent.id.includes('-')
        ? activeEvent.id.split('-')[0]
        : activeEvent.id;

      // If this is a split event, we need to get the original event data
      const extendedEvent = activeEvent as ExtendedCalendarEvent;
      const eventData = extendedEvent._originalId
        ? { ...extendedEvent, id: originalId }
        : extendedEvent;

      setEvent({
        ...eventData,
        priority: eventData.priority || 'medium',
      });

      // Check if this is an all-day event (no time component)
      const start = new Date(eventData.start_at);
      const end = new Date(eventData.end_at);

      const isAllDayEvent =
        start.getHours() === 0 &&
        start.getMinutes() === 0 &&
        end.getHours() === 23 &&
        end.getMinutes() === 59;

      setIsAllDay(isAllDayEvent);

      // Check if this is a multi-day event
      const startDay = new Date(start);
      startDay.setHours(0, 0, 0, 0);

      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);

      setIsMultiDay(startDay.getTime() !== endDay.getTime());

      // Check for overlapping events
      checkForOverlaps(eventData);

      // Set active tab to manual when editing an existing event
      setActiveTab('manual');
    } else {
      // Set default values for new event
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      const newEvent = {
        title: '',
        description: '',
        start_at: now.toISOString(),
        end_at: oneHourLater.toISOString(),
        color: 'BLUE' as SupportedColor,
        location: '',
        priority: 'medium' as EventPriority,
      };

      setEvent(newEvent);
      setIsAllDay(false);
      setIsMultiDay(false);

      // Reset AI form
      aiForm.reset();
      setGeneratedEvents([]);
    }

    // Clear any error messages
    setDateError(null);
  }, [activeEvent, isModalOpen]);

  // Function to check for overlapping events
  const checkForOverlaps = (eventToCheck: Partial<CalendarEvent>) => {
    if (!eventToCheck.start_at || !eventToCheck.end_at) return;

    const allEvents = getEvents();
    const eventStart = new Date(eventToCheck.start_at);
    const eventEnd = new Date(eventToCheck.end_at);

    // Find events that overlap with this event
    const overlaps = allEvents.filter((existingEvent) => {
      // Skip comparing with the current event being edited
      if (existingEvent.id === activeEvent?.id) return false;

      const existingStart = new Date(existingEvent.start_at);
      const existingEnd = new Date(existingEvent.end_at);

      // Check if the events are on the same day
      const isSameDay =
        existingStart.getDate() === eventStart.getDate() &&
        existingStart.getMonth() === eventStart.getMonth() &&
        existingStart.getFullYear() === eventStart.getFullYear();

      if (!isSameDay) return false;

      // Check for time overlap
      return !(existingEnd <= eventStart || existingStart >= eventEnd);
    });

    setOverlappingEvents(overlaps);
    setShowOverlapWarning(overlaps.length > 0);
  };

  // Handle manual event save
  const handleManualSave = async () => {
    if (!event.start_at || !event.end_at) return;

    const startDate = new Date(event.start_at);
    const endDate = new Date(event.end_at);

    if (endDate <= startDate) {
      setDateError('End date must be after start date');
      return;
    }

    setDateError(null);
    setIsSaving(true);

    try {
      let savedEvent: CalendarEvent;
      if (activeEvent?.id === 'new') {
        savedEvent = await addEvent(event as Omit<CalendarEvent, 'id'>);
      } else if (activeEvent?.id) {
        const originalId = activeEvent.id;
        if (originalId) {
          savedEvent = await updateEvent(originalId, event);
        } else {
          throw new Error('Invalid event ID');
        }
      } else {
        throw new Error('No event to save');
      }

      await syncWithGoogleCalendar(savedEvent);
      toast({
        title: 'Success',
        description: 'Event saved and synced with Google Calendar',
      });

      closeModal();
    } catch (error) {
      console.error('Error saving event:', error);
      toast({
        title: 'Error',
        description: 'Failed to save or sync event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle AI event save
  const handleAISave = async () => {
    if (generatedEvents.length === 0) return;

    setIsSaving(true);
    try {
      const eventsToSave = generatedEvents;
      const savedEvents: CalendarEvent[] = [];

      for (const eventData of eventsToSave) {
        const calendarEvent: Omit<CalendarEvent, 'id'> = {
          title: eventData.title || 'New Event',
          description: eventData.description || '',
          start_at: eventData.start_at,
          end_at: eventData.end_at,
          color: eventData.color || 'BLUE',
          location: eventData.location || '',
          is_all_day: Boolean(eventData.is_all_day),
          scheduling_note: eventData.scheduling_note || '',
          priority: eventData.priority || aiForm.getValues().priority,
        };

        const savedEvent = await addEvent(calendarEvent);
        savedEvents.push(savedEvent);
        await syncWithGoogleCalendar(savedEvent); // Đồng bộ từng sự kiện
      }

      toast({
        title: 'Success',
        description: `${eventsToSave.length} event${eventsToSave.length > 1 ? 's' : ''} saved and synced with Google Calendar`,
      });

      closeModal();
    } catch (error) {
      console.error('Error saving AI events to calendar:', error);
      toast({
        title: 'Error',
        description: 'Failed to save or sync AI-generated events.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle event deletion
  const handleDelete = async () => {
    if (!activeEvent?.id) return;

    setIsDeleting(true);
    try {
      // For split events, use the original ID
      const originalId = activeEvent.id;

      // Make sure originalId is not undefined
      if (originalId) {
        await deleteEvent(originalId);
      }
      closeModal();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle start date change
  const handleStartDateChange = (date: Date | undefined) => {
    if (!date) return;

    setEvent((prev) => {
      const newEvent = { ...prev, start_at: date.toISOString() };

      // If start time is after end time, push end time forward
      const endDate = new Date(prev.end_at || '');
      if (date > endDate) {
        const duration =
          endDate.getTime() - new Date(prev.start_at || '').getTime();
        const newEndDate = new Date(date.getTime() + duration);
        newEvent.end_at = newEndDate.toISOString();
      }

      return newEvent;
    });

    // Clear any error messages
    setDateError(null);
  };

  // Handle end date change
  const handleEndDateChange = (date: Date | undefined) => {
    if (!date) return;

    setEvent((prev) => {
      const newEvent = { ...prev, end_at: date.toISOString() };

      // If end time is before start time, pull start time backward
      const startDate = new Date(prev.start_at || '');
      if (date < startDate) {
        newEvent.start_at = date.toISOString();
      }

      return newEvent;
    });

    // Clear any error messages
    setDateError(null);
  };

  // Handle all-day toggle
  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);

    setEvent((prev) => {
      const startDate = new Date(prev.start_at || '');
      const endDate = new Date(prev.end_at || '');

      if (checked) {
        // Set to all day: start at 00:00, end at 23:59
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Set to specific time: default to current time for start, +1 hour for end
        const now = new Date();
        startDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
        endDate.setHours(now.getHours() + 1, now.getMinutes(), 0, 0);
      }

      return {
        ...prev,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
      };
    });
  };

  // Handle multi-day toggle
  const handleMultiDayChange = (checked: boolean) => {
    setIsMultiDay(checked);

    setEvent((prev) => {
      const startDate = new Date(prev.start_at || '');
      const endDate = new Date(prev.end_at || '');

      if (checked && startDate.getDate() === endDate.getDate()) {
        // If turning on multi-day and currently same day, extend to next day
        endDate.setDate(endDate.getDate() + 1);
      } else if (!checked && startDate.getDate() !== endDate.getDate()) {
        // If turning off multi-day and currently different days, set end to same day
        endDate.setFullYear(
          startDate.getFullYear(),
          startDate.getMonth(),
          startDate.getDate()
        );
        endDate.setHours(23, 59, 59, 999);
      }

      return {
        ...prev,
        end_at: endDate.toISOString(),
      };
    });
  };

  // Handle AI event generation
  const handleGenerateEvent = async (values: z.infer<typeof AIFormSchema>) => {
    try {
      // Include timezone in the prompt for accurate time conversion
      const promptWithTimezone = `${values.prompt} (User timezone: ${values.timezone})`;

      // Add priority information to the prompt
      const promptWithPriority = `${promptWithTimezone} (Priority: ${values.priority})`;

      // Get existing events for smart scheduling
      const existingEvents = values.smart_scheduling ? getEvents() : [];

      // Generate helpful suggestions based on the prompt
      const suggestions = [
        'Consider adding a buffer time before/after these events',
        'These events might benefit from reminder notifications',
        'Based on your schedule, early morning might be better for focus',
        'Consider adding meeting agenda or preparation notes',
      ];
      setAiSuggestions(suggestions.slice(0, 3)); // Show up to 3 relevant suggestions

      submit({
        prompt: promptWithPriority,
        current_time: new Date().toISOString(),
        smart_scheduling: values.smart_scheduling,
        existing_events: values.smart_scheduling ? existingEvents : undefined,
      });
    } catch (error) {
      console.error('Error generating events:', error);
      toast({
        title: 'Error generating events',
        description: 'Please try again with a different prompt',
        variant: 'destructive',
      });
    }
  };

  // Handle navigation between multiple events in preview
  const goToNextEvent = () => {
    if (currentEventIndex < generatedEvents.length - 1) {
      const nextIndex = currentEventIndex + 1;
      setCurrentEventIndex(nextIndex);
      if (aiForm.getValues().smart_scheduling) {
        const nextEvent = generatedEvents[nextIndex];
        if (nextEvent && nextEvent.start_at && nextEvent.end_at) {
          checkForOverlaps(nextEvent as Partial<CalendarEvent>);
        }
      }
    }
  };

  const goToPreviousEvent = () => {
    if (currentEventIndex > 0) {
      const prevIndex = currentEventIndex - 1;
      setCurrentEventIndex(prevIndex);
      if (aiForm.getValues().smart_scheduling) {
        const prevEvent = generatedEvents[prevIndex];
        if (prevEvent && prevEvent.start_at && prevEvent.end_at) {
          checkForOverlaps(prevEvent as Partial<CalendarEvent>);
        }
      }
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Edit Event' : 'Create Event'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Make changes to your existing event'
              : 'Add a new event to your calendar'}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as any)}
          className="flex h-[calc(90vh-140px)] flex-col"
        >
          <TabsList className="justify-start gap-2 bg-transparent px-6 pb-0 pt-4">
            <TabsTrigger
              value="ai"
              className="data-[state=active]:bg-background rounded-b-none rounded-t-md border-b-0 px-4 py-2 data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:shadow-sm"
              disabled={!!isEditing}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              className="data-[state=active]:bg-background rounded-b-none rounded-t-md border-b-0 px-4 py-2 data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:shadow-sm"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              Manual
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden border-t">
            {/* Manual Event Creation Tab */}
            <TabsContent
              value="manual"
              className="h-full p-0 focus-visible:outline-none focus-visible:ring-0 data-[state=active]:flex data-[state=active]:flex-col"
              style={{ display: activeTab === 'manual' ? 'flex' : 'none' }}
            >
              <div className="flex flex-1 flex-col overflow-hidden">
                <ScrollArea className="h-[calc(90vh-250px)] flex-1">
                  <div className="space-y-6 p-6">
                    {/* Title */}
                    <EventTitleInput
                      value={event.title || ''}
                      onEnter={handleManualSave}
                      onChange={(value) => setEvent({ ...event, title: value })}
                    />

                    {/* Date and Time Selection */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Date & Time</h3>
                        <div className="flex items-center gap-4">
                          <EventToggleSwitch
                            id="all-day"
                            label="All Day"
                            checked={isAllDay}
                            onChange={handleAllDayChange}
                          />
                          <EventToggleSwitch
                            id="multi-day"
                            label="Multi-Day"
                            checked={isMultiDay}
                            onChange={handleMultiDayChange}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <EventDateTimePicker
                          label="Start"
                          value={new Date(event.start_at || new Date())}
                          onChange={handleStartDateChange}
                          //   icon={<Clock className="h-3.5 w-3.5 text-blue-500" />}
                        />
                        <EventDateTimePicker
                          label="End"
                          value={new Date(event.end_at || new Date())}
                          onChange={handleEndDateChange}
                          //   icon={<Clock className="h-3.5 w-3.5 text-red-500" />}
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* Location and Description */}
                    <div className="space-y-4">
                      <EventLocationInput
                        value={event.location || ''}
                        onChange={(value) =>
                          setEvent({ ...event, location: value })
                        }
                      />
                      <EventDescriptionInput
                        value={event.description || ''}
                        onChange={(value) =>
                          setEvent({ ...event, description: value })
                        }
                      />
                    </div>

                    <Separator />

                    {/* Advanced Settings */}
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem
                        value="advanced-settings"
                        className="border-none"
                      >
                        <AccordionTrigger className="py-2 hover:no-underline">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Settings className="h-4 w-4" />
                            Advanced Settings
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0 pt-2">
                          <div className="bg-muted/30 space-y-4 rounded-lg p-4">
                            <h3 className="text-sm font-medium">
                              Event Properties
                            </h3>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                              <EventColorPicker
                                value={event.color || 'BLUE'}
                                onChange={(value) =>
                                  setEvent({ ...event, color: value })
                                }
                              />
                              {/* <EventPriorityPicker
                                value={event.priority || 'medium'}
                                onChange={(value) =>
                                  setEvent({ ...event, priority: value })
                                }
                              /> */}
                            </div>
                            <div className="text-muted-foreground mt-2 text-xs">
                              <p className="flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                Color and priority help organize and prioritize
                                your events
                              </p>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    {/* Warnings and Errors */}
                    {(showOverlapWarning || dateError) && (
                      <>
                        <Separator />
                        <div className="space-y-3">
                          {showOverlapWarning && (
                            <OverlapWarning
                              overlappingEvents={overlappingEvents}
                            />
                          )}
                          {dateError && <DateError error={dateError} />}
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>

                {/* Action Buttons */}
                <div className="mt-auto border-t p-6">
                  <div className="flex justify-between">
                    {isEditing ? (
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isSaving || isDeleting}
                        className="flex items-center gap-2"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                          </>
                        )}
                      </Button>
                    ) : (
                      <div></div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleGoogleAuth}
                        disabled={isGoogleAuthenticating}
                      >
                        {isGoogleAuthenticating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Link Google Calendar'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleSyncWithGoogle}
                        disabled={!activeEvent || isSaving}
                      >
                        Sync with Google
                      </Button>
                      <Button
                        variant="outline"
                        onClick={closeModal}
                        disabled={isSaving || isDeleting}
                        className="flex items-center gap-2"
                      >
                        <X className="h-4 w-4" />
                        <span>Cancel</span>
                      </Button>
                      <Button
                        onClick={handleManualSave}
                        disabled={isSaving || isDeleting}
                        className="flex items-center gap-2"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4" />
                            <span>{isEditing ? 'Update' : 'Create'}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* AI Event Generation Tab */}
            <TabsContent
              value="ai"
              className="h-full p-0 focus-visible:outline-none focus-visible:ring-0 data-[state=active]:flex data-[state=active]:flex-col"
              style={{ display: activeTab === 'ai' ? 'flex' : 'none' }}
            >
              <Form {...aiForm}>
                <form
                  onSubmit={aiForm.handleSubmit(handleGenerateEvent)}
                  className="flex h-full flex-1 flex-col"
                >
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <ScrollArea className="h-[calc(90vh-250px)] flex-1">
                      <div className="space-y-6 p-6">
                        <div className="from-primary/20 via-primary/10 rounded-lg bg-gradient-to-r to-transparent p-6">
                          <div className="mb-3 flex items-center gap-2">
                            <Sparkles className="text-primary h-5 w-5" />
                            <h3 className="text-lg font-medium">
                              AI Event Assistant
                            </h3>
                          </div>
                          <p className="text-muted-foreground mb-4 text-sm">
                            Describe your event in natural language and our AI
                            will create it for you. Include details like title,
                            date, time, duration, location, and any other
                            relevant information. You can also describe multiple
                            events at once.
                          </p>
                          <div className="space-y-2">
                            <p className="text-muted-foreground text-xs font-medium">
                              Examples:
                            </p>
                            <div className="space-y-2">
                              <div className="bg-muted/50 rounded-md p-2 text-xs">
                                "Schedule a team meeting next Monday at 2pm for
                                1 hour to discuss the new project roadmap"
                              </div>
                              <div className="bg-muted/50 rounded-md p-2 text-xs">
                                "Lunch with Sarah at Cafe Milano tomorrow at
                                noon, high priority"
                              </div>
                              <div className="bg-muted/50 rounded-md p-2 text-xs">
                                "Block 3 hours for focused work on the
                                presentation every morning this week"
                              </div>
                              <div className="bg-muted/50 rounded-md p-2 text-xs">
                                "Create a series of 1-hour workout sessions at
                                the gym on Monday, Wednesday, and Friday at 7am
                                next week"
                              </div>
                            </div>
                          </div>
                        </div>

                        <FormField
                          control={aiForm.control}
                          name="prompt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base font-medium">
                                Describe your event
                              </FormLabel>
                              <FormControl>
                                <textarea
                                  {...field}
                                  className="border-input bg-background focus:ring-ring min-h-[150px] w-full resize-none rounded-md border p-4 text-base focus:outline-none focus:ring-1"
                                  placeholder="E.g., Schedule a team meeting next Monday at 2pm for 1 hour to discuss the new project roadmap with the engineering team"
                                  autoFocus
                                />
                              </FormControl>
                              <FormDescription className="flex items-center gap-1 text-xs">
                                <Info className="h-3 w-3" />
                                Be as specific as possible for best results
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* AI Settings - Simplified and more prominent */}
                        <div className="bg-muted/10 rounded-lg border p-4">
                          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                            <Cog className="h-4 w-4" />
                            AI Settings
                          </h3>

                          <div className="space-y-4">
                            <div className="flex items-center justify-between space-x-2">
                              <div className="space-y-0.5">
                                <h4 className="text-sm font-medium">
                                  Smart Scheduling
                                </h4>
                                <p className="text-muted-foreground text-xs">
                                  Automatically find available time slots based
                                  on your existing events
                                </p>
                              </div>
                              <Switch
                                id="smart-scheduling"
                                checked={!!aiForm.watch('smart_scheduling')}
                                onCheckedChange={(checked) =>
                                  aiForm.setValue('smart_scheduling', checked)
                                }
                              />
                            </div>

                            <FormField
                              control={aiForm.control}
                              name="priority"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center justify-between">
                                    <FormLabel className="text-sm font-medium">
                                      Priority
                                    </FormLabel>
                                    <FormControl>
                                      <select
                                        {...field}
                                        className="border-input bg-background w-[180px] rounded-md border p-2 text-sm"
                                      >
                                        <option value="low">
                                          Low - Can be rescheduled
                                        </option>
                                        <option value="medium">
                                          Medium - Standard
                                        </option>
                                        <option value="high">
                                          High - Important
                                        </option>
                                      </select>
                                    </FormControl>
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        {isLoading && (
                          <div className="flex items-center justify-center py-8">
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="text-primary h-8 w-8 animate-spin" />
                              <p className="text-muted-foreground text-sm">
                                Creating your event...
                              </p>
                            </div>
                          </div>
                        )}

                        {error && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>
                              {error.message ||
                                'Failed to generate event. Please try again.'}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </ScrollArea>

                    {/* Action Buttons */}
                    <div className="mt-auto border-t p-6">
                      <div className="flex justify-between">
                        <Button
                          variant="outline"
                          onClick={closeModal}
                          disabled={isLoading}
                          className="flex items-center gap-2"
                        >
                          <X className="h-4 w-4" />
                          <span>Cancel</span>
                        </Button>
                        <Button
                          type="submit"
                          disabled={isLoading || !aiForm.watch('prompt')}
                          className="bg-primary flex items-center gap-2"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Creating...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              <span>Generate Event</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              </Form>
            </TabsContent>

            {/* Preview Tab */}
            <TabsContent
              value="preview"
              className="h-full p-0 focus-visible:outline-none focus-visible:ring-0 data-[state=active]:flex data-[state=active]:flex-col"
              style={{ display: activeTab === 'preview' ? 'flex' : 'none' }}
            >
              <div className="flex flex-1 flex-col overflow-hidden">
                <ScrollArea className="h-[calc(90vh-250px)] flex-1">
                  <div className="space-y-6 p-6">
                    {/* AI Generated Event Preview */}
                    <div className="bg-muted/10 rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-base font-medium">
                          <Sparkles className="text-primary h-4 w-4" />
                          AI Generated Event
                          {generatedEvents.length > 1 ? 's' : ''}
                        </h3>
                        <div className="flex items-center gap-2">
                          {generatedEvents.length > 1 && (
                            <div className="text-muted-foreground flex items-center gap-1 text-xs">
                              <span>{currentEventIndex + 1}</span>
                              <span>/</span>
                              <span>{generatedEvents.length}</span>
                            </div>
                          )}
                          <Badge variant="outline" className="text-xs">
                            Preview
                          </Badge>
                        </div>
                      </div>

                      {generatedEvent && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <h4 className="text-lg font-medium">
                              {generatedEvent.title}
                            </h4>
                            <div className="text-muted-foreground flex flex-wrap gap-2 text-sm">
                              <div className="flex items-center gap-1">
                                <CalendarIcon className="h-3.5 w-3.5" />
                                <span>
                                  {format(
                                    new Date(generatedEvent.start_at),
                                    'PPP'
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                <span>
                                  {format(
                                    new Date(generatedEvent.start_at),
                                    'h:mm a'
                                  )}{' '}
                                  -{' '}
                                  {format(
                                    new Date(generatedEvent.end_at),
                                    'h:mm a'
                                  )}
                                </span>
                              </div>
                              {generatedEvent.location && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span>{generatedEvent.location}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {generatedEvent.description && (
                            <div className="space-y-1">
                              <h5 className="text-sm font-medium">
                                Description
                              </h5>
                              <p className="text-muted-foreground text-sm">
                                {generatedEvent.description}
                              </p>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <div
                              className={`h-3 w-3 rounded-full`}
                              style={{
                                backgroundColor: `var(--dynamic-light-${generatedEvent.color.toLowerCase()})`,
                              }}
                            />
                            <span className="text-muted-foreground text-xs">
                              {
                                COLOR_OPTIONS.find(
                                  (c) => c.value === generatedEvent.color
                                )?.name
                              }
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Navigation buttons for multiple events */}
                      {generatedEvents.length > 1 && (
                        <div className="mt-4 flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={goToPreviousEvent}
                            disabled={currentEventIndex === 0}
                            className="h-8 w-8 p-0"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={goToNextEvent}
                            disabled={
                              currentEventIndex === generatedEvents.length - 1
                            }
                            className="h-8 w-8 p-0"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* AI Insights and Suggestions */}
                    {aiSuggestions.length > 0 && (
                      <div className="bg-muted/10 rounded-lg border p-4">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <Brain className="text-primary h-4 w-4" />
                          AI Insights & Suggestions
                        </h3>
                        <ul className="space-y-2">
                          {aiSuggestions.map((suggestion, index) => (
                            <li
                              key={index}
                              className="flex items-start gap-2 text-sm"
                            >
                              <div className="text-primary mt-0.5">•</div>
                              <span>{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Warnings and Errors */}
                    {showOverlapWarning && (
                      <OverlapWarning overlappingEvents={overlappingEvents} />
                    )}
                  </div>
                </ScrollArea>

                {/* Action Buttons */}
                <div className="mt-auto border-t p-6">
                  <div className="flex justify-between">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setActiveTab('ai')}
                        className="flex items-center gap-2"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Back</span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          // Transfer AI generated event to manual form
                          if (generatedEvent) {
                            setEvent({
                              ...generatedEvent,
                              id: undefined, // Remove ID to create a new event
                            });
                            setActiveTab('manual');
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        <span>Edit Details</span>
                      </Button>
                    </div>
                    <Button
                      onClick={handleAISave}
                      disabled={isSaving || generatedEvents.length === 0}
                      className="flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          <span>
                            Save{' '}
                            {generatedEvents.length > 1
                              ? 'All Events'
                              : 'Event'}
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
