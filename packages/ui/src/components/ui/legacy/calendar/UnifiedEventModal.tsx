'use client';

import { useCalendar } from '../../../../hooks/use-calendar';
import {
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
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import {
  AlertCircle,
  Brain,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  CircleAlert,
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

// Extended CalendarEvent type to include multi-day event properties
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
  } = useCalendar();

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
  const [generatedEvent, setGeneratedEvent] = useState<any>(null);
  const [userTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Shared state
  const [activeTab, setActiveTab] = useState<'manual' | 'ai' | 'preview'>(
    'manual'
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
    schema: calendarEventSchema,
  });

  // Handle AI-generated event
  useEffect(() => {
    if (object && !isLoading) {
      // Ensure color is uppercase to match SupportedColor type
      const processedEvent = {
        ...object,
        color: object.color
          ? (object.color.toString().toUpperCase() as SupportedColor)
          : 'BLUE',
      };

      setGeneratedEvent(processedEvent);

      // Find overlapping events when a new event is generated
      if (aiForm.getValues().smart_scheduling) {
        checkForOverlaps(processedEvent);
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
      setGeneratedEvent(null);
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

    // Validate dates
    const startDate = new Date(event.start_at);
    const endDate = new Date(event.end_at);

    if (endDate <= startDate) {
      setDateError('End date must be after start date');
      return;
    }

    setDateError(null);
    setIsSaving(true);

    try {
      // Check if this is a new event or an existing one
      if (activeEvent?.id === 'new') {
        // Create a new event
        await addEvent(event as Omit<CalendarEvent, 'id'>);
      } else if (activeEvent?.id) {
        // For split events, use the original ID
        const originalId = activeEvent.id;

        // Make sure originalId is not undefined
        if (originalId) {
          // Update existing event
          await updateEvent(originalId, event);
        }
      }
      closeModal();
    } catch (error) {
      console.error('Error saving event:', error);
      toast({
        title: 'Error',
        description: 'Failed to save event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle AI event save
  const handleAISave = async () => {
    if (!generatedEvent) return;

    setIsSaving(true);
    try {
      const calendarEvent: Omit<CalendarEvent, 'id'> = {
        title: generatedEvent.title || 'New Event',
        description: generatedEvent.description || '',
        start_at: generatedEvent.start_at,
        end_at: generatedEvent.end_at,
        color: generatedEvent.color || 'BLUE',
        location: generatedEvent.location || '',
        is_all_day: Boolean(generatedEvent.is_all_day),
        scheduling_note: generatedEvent.scheduling_note || '',
        priority: generatedEvent.priority || aiForm.getValues().priority,
      };

      await addEvent(calendarEvent);

      closeModal();
    } catch (error) {
      console.error('Error saving AI event to calendar:', error);
      toast({
        title: 'Error',
        description: 'Failed to save AI-generated event. Please try again.',
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

      submit({
        prompt: promptWithPriority,
        current_time: new Date().toISOString(),
        smart_scheduling: values.smart_scheduling,
        existing_events: values.smart_scheduling ? existingEvents : undefined,
      });
    } catch (error) {
      console.error('Error generating event:', error);
      toast({
        title: 'Error generating event',
        description: 'Please try again with a different prompt',
        variant: 'destructive',
      });
    }
  };

  // Determine if we're editing an existing event
  const isEditing = activeEvent?.id && activeEvent.id !== 'new';

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
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
          <TabsList className="justify-start gap-2 bg-transparent px-6 pt-4 pb-0">
            <TabsTrigger
              value="manual"
              className="rounded-t-md rounded-b-none border-b-0 px-4 py-2 data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              Manual
            </TabsTrigger>
            <TabsTrigger
              value="ai"
              className="rounded-t-md rounded-b-none border-b-0 px-4 py-2 data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              disabled={!!isEditing}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AI Assistant
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden border-t">
            {/* Manual Event Creation Tab */}
            <TabsContent
              value="manual"
              className="h-full p-0 focus-visible:ring-0 focus-visible:outline-none data-[state=active]:flex data-[state=active]:flex-col"
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
                        <AccordionContent className="pt-2 pb-0">
                          <div className="space-y-4 rounded-lg bg-muted/30 p-4">
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
                            <div className="mt-2 text-xs text-muted-foreground">
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
              className="h-full p-0 focus-visible:ring-0 focus-visible:outline-none data-[state=active]:flex data-[state=active]:flex-col"
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
                        <div className="rounded-lg bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <h3 className="text-base font-medium">
                              AI Event Assistant
                            </h3>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Describe your event in natural language and our AI
                            will create it for you.
                          </p>
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
                                  className="min-h-[150px] w-full resize-none rounded-md border border-input bg-background p-4 focus:ring-1 focus:ring-ring focus:outline-none"
                                  placeholder="E.g., Schedule a team meeting next Monday at 2pm for 1 hour to discuss the new project roadmap with the engineering team"
                                />
                              </FormControl>
                              <FormDescription className="text-xs">
                                Include details like title, date, time,
                                duration, location, and any other relevant
                                information
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Separator />

                        {/* AI Settings */}
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem
                            value="ai-settings"
                            className="border-none"
                          >
                            <AccordionTrigger className="py-2 hover:no-underline">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Cog className="h-4 w-4" />
                                AI Settings
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2 pb-0">
                              <div className="space-y-4 rounded-lg bg-muted/30 p-4">
                                <div className="flex items-center justify-between space-x-2">
                                  <div className="space-y-0.5">
                                    <h3 className="text-sm font-medium">
                                      Smart Scheduling
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                      Automatically find available time slots
                                      based on your existing events
                                    </p>
                                  </div>
                                  <Switch
                                    id="smart-scheduling"
                                    checked={!!aiForm.watch('smart_scheduling')}
                                    onCheckedChange={(checked) =>
                                      aiForm.setValue(
                                        'smart_scheduling',
                                        checked
                                      )
                                    }
                                  />
                                </div>

                                <FormField
                                  control={aiForm.control}
                                  name="priority"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-medium">
                                        Priority
                                      </FormLabel>
                                      <FormControl>
                                        <select
                                          {...field}
                                          className="w-full rounded-md border border-input bg-background p-2"
                                        >
                                          <option value="low">
                                            Low - Can be easily rescheduled
                                          </option>
                                          <option value="medium">
                                            Medium - Standard priority
                                          </option>
                                          <option value="high">
                                            High - Important, avoid rescheduling
                                          </option>
                                        </select>
                                      </FormControl>
                                      <FormDescription className="text-xs">
                                        Set the priority level for this event
                                      </FormDescription>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>

                        {error && (
                          <div className="rounded-md bg-red-50 p-3 text-sm text-red-500">
                            <AlertCircle className="mr-1 inline h-4 w-4" />
                            {error instanceof Error
                              ? error.message
                              : String(error)}
                          </div>
                        )}
                      </div>
                    </ScrollArea>

                    <div className="mt-auto border-t p-6">
                      <Button
                        type="submit"
                        className="flex w-full items-center justify-center gap-2 py-5"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Generating your event...</span>
                          </>
                        ) : (
                          <>
                            <Brain className="h-5 w-5" />
                            <span>Generate Event with AI</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            </TabsContent>

            {/* AI Preview Tab */}
            <TabsContent
              value="preview"
              className="h-full p-0 focus-visible:ring-0 focus-visible:outline-none data-[state=active]:flex data-[state=active]:flex-col"
              style={{ display: activeTab === 'preview' ? 'flex' : 'none' }}
            >
              {generatedEvent ? (
                <>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <ScrollArea className="h-[calc(90vh-250px)] flex-1">
                      <div className="space-y-6 p-6">
                        <div className="rounded-lg border bg-background p-6">
                          <div className="mb-6 flex items-center gap-3">
                            <div
                              className={cn(
                                'h-4 w-4 rounded-full',
                                generatedEvent.color === 'BLUE' &&
                                  'bg-blue-500',
                                generatedEvent.color === 'RED' && 'bg-red-500',
                                generatedEvent.color === 'GREEN' &&
                                  'bg-green-500',
                                generatedEvent.color === 'YELLOW' &&
                                  'bg-yellow-500',
                                generatedEvent.color === 'ORANGE' &&
                                  'bg-orange-500',
                                generatedEvent.color === 'PURPLE' &&
                                  'bg-purple-500',
                                generatedEvent.color === 'PINK' &&
                                  'bg-pink-500',
                                generatedEvent.color === 'INDIGO' &&
                                  'bg-indigo-500',
                                generatedEvent.color === 'CYAN' &&
                                  'bg-cyan-500',
                                generatedEvent.color === 'GRAY' && 'bg-gray-500'
                              )}
                            />
                            <h3 className="text-xl font-medium">
                              {generatedEvent.title || 'New Event'}
                            </h3>
                            <Badge
                              variant="outline"
                              className={cn(
                                'ml-auto flex items-center gap-1',
                                generatedEvent.priority === 'high' &&
                                  'border-red-200 text-red-500',
                                generatedEvent.priority === 'medium' &&
                                  'border-green-200 text-green-500',
                                generatedEvent.priority === 'low' &&
                                  'border-blue-200 text-blue-500'
                              )}
                            >
                              <CircleAlert className="h-3 w-3" />
                              {generatedEvent.priority || 'medium'} priority
                            </Badge>
                          </div>

                          <div className="space-y-6">
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                              <div className="flex items-start gap-3">
                                <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                                <div>
                                  <p className="mb-1 text-sm text-muted-foreground">
                                    Start
                                  </p>
                                  <p className="font-medium">
                                    {format(
                                      new Date(generatedEvent.start_at),
                                      'PPP'
                                    )}
                                  </p>
                                  <p className="text-sm">
                                    {format(
                                      new Date(generatedEvent.start_at),
                                      'p'
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                                <div>
                                  <p className="mb-1 text-sm text-muted-foreground">
                                    End
                                  </p>
                                  <p className="font-medium">
                                    {format(
                                      new Date(generatedEvent.end_at),
                                      'PPP'
                                    )}
                                  </p>
                                  <p className="text-sm">
                                    {format(
                                      new Date(generatedEvent.end_at),
                                      'p'
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {generatedEvent.location && (
                              <div className="flex items-start gap-3">
                                <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                                <div>
                                  <p className="mb-1 text-sm text-muted-foreground">
                                    Location
                                  </p>
                                  <p className="font-medium">
                                    {generatedEvent.location}
                                  </p>
                                </div>
                              </div>
                            )}

                            {generatedEvent.description && (
                              <div className="flex items-start gap-3">
                                <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                                <div>
                                  <p className="mb-1 text-sm text-muted-foreground">
                                    Description
                                  </p>
                                  <p className="whitespace-pre-wrap">
                                    {generatedEvent.description}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {overlappingEvents.length > 0 && (
                          <OverlapWarning
                            overlappingEvents={overlappingEvents}
                          />
                        )}
                      </div>
                    </ScrollArea>

                    <div className="mt-auto border-t p-6">
                      <div className="flex justify-between">
                        <Button
                          variant="outline"
                          onClick={() => setActiveTab('ai')}
                          className="flex items-center gap-2"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Back to AI Assistant
                        </Button>
                        <Button
                          onClick={handleAISave}
                          disabled={isSaving}
                          className="flex items-center gap-2"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <CalendarIcon className="h-4 w-4" />
                              Add to Calendar
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <div className="p-6 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                      <Sparkles className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mb-2 text-lg font-medium">
                      No event generated yet
                    </h3>
                    <p className="mb-6 text-muted-foreground">
                      Go to the AI Assistant tab to create one
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setActiveTab('ai')}
                      className="mx-auto flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Go to AI Assistant
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
