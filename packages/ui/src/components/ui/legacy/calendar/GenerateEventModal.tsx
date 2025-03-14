'use client';

import { useCalendar } from '../../../../hooks/use-calendar';
import { calendarEventSchema } from '@tuturuuu/ai/calendar/events';
import { useObject } from '@tuturuuu/ai/object/core';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { format } from 'date-fns';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';

// Form schema for AI event generation
const FormSchema = z.object({
  prompt: z.string().min(1, 'Please enter a prompt to generate an event'),
  timezone: z
    .string()
    .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  smart_scheduling: z.boolean().default(true),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

interface GenerateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateEventModal({
  open,
  onOpenChange,
}: GenerateEventModalProps) {
  const { toast } = useToast();
  const { addEvent, getEvents } = useCalendar();
  const [activeTab, setActiveTab] = useState<'ai' | 'preview'>('ai');
  const [generatedEvent, setGeneratedEvent] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [userTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [overlappingEvents, setOverlappingEvents] = useState<any[]>([]);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      prompt: '',
      timezone: userTimezone,
      smart_scheduling: true,
      priority: 'medium',
    },
  });

  const { object, submit, error, isLoading } = useObject({
    api: '/api/v1/calendar/events/generate',
    schema: calendarEventSchema,
  });

  useEffect(() => {
    if (object && !isLoading) {
      setGeneratedEvent(object);

      // Find overlapping events when a new event is generated
      if (form.getValues().smart_scheduling) {
        findOverlappingEvents(object);
      }

      setActiveTab('preview');
      setGenerating(false);
    }
  }, [object, isLoading, form]);

  // Function to find overlapping events
  const findOverlappingEvents = (newEvent: any) => {
    if (!newEvent) return;

    const allEvents = getEvents();
    const newEventStart = new Date(newEvent.start_at);
    const newEventEnd = new Date(newEvent.end_at);

    // Find events that overlap with the new event
    const overlaps = allEvents.filter((event: any) => {
      const eventStart = new Date(event.start_at);
      const eventEnd = new Date(event.end_at);

      // Check if the events are on the same day
      const isSameDay =
        eventStart.getDate() === newEventStart.getDate() &&
        eventStart.getMonth() === newEventStart.getMonth() &&
        eventStart.getFullYear() === newEventStart.getFullYear();

      if (!isSameDay) return false;

      // Check for time overlap
      return !(eventEnd <= newEventStart || eventStart >= newEventEnd);
    });

    setOverlappingEvents(overlaps);
  };

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    setGenerating(true);
    setOverlappingEvents([]);
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
      setGenerating(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
    setGeneratedEvent(null);
    setOverlappingEvents([]);
    setActiveTab('ai');
  };

  const handleSaveToCalendar = async () => {
    if (!generatedEvent) return;

    try {
      // Convert the AI-generated event to a format compatible with the calendar
      // Ensure color is uppercase to match SupportedColor type
      const colorValue = generatedEvent.color
        ? (generatedEvent.color.toUpperCase() as SupportedColor)
        : 'BLUE';

      const calendarEvent: Omit<CalendarEvent, 'id'> = {
        title: generatedEvent.title || 'New Event',
        description: generatedEvent.description || '',
        start_at: generatedEvent.start_at,
        end_at: generatedEvent.end_at,
        color: colorValue,
        location: generatedEvent.location || '',
        is_all_day: generatedEvent.is_all_day || false,
        scheduling_note: generatedEvent.scheduling_note || '',
        priority: generatedEvent.priority || form.getValues().priority,
      };

      await addEvent(calendarEvent);
      toast({
        title: 'Event created',
        description: 'Your event has been added to the calendar',
      });
      handleClose();
    } catch (error) {
      console.error('Error saving event to calendar:', error);
      toast({
        title: 'Error saving event',
        description: 'Failed to add the event to your calendar',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Generate Calendar Event</DialogTitle>
          <DialogDescription>
            Use AI to generate a calendar event from your description
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'ai' | 'preview')}
        >
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="ai" className="flex items-center gap-1.5">
              <span className="hidden sm:inline">AI Generate</span>
              <span className="sm:hidden">Generate</span>
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              disabled={!generatedEvent}
              className="flex items-center gap-1.5"
            >
              <span className="hidden sm:inline">Event Preview</span>
              <span className="sm:hidden">Preview</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Quick examples:</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  'Weekly team standup every Monday at 9:30am for 30 minutes',
                  'Lunch with Sarah at Italian Restaurant tomorrow at noon',
                  'Dentist appointment next Tuesday at 2pm for 1 hour',
                  'Monthly project review on the first Friday of next month at 10am',
                ].map((example) => (
                  <Button
                    key={example}
                    variant="outline"
                    size="sm"
                    className="h-auto px-3 py-2 text-left text-xs whitespace-normal"
                    onClick={() => {
                      form.setValue('prompt', example);
                    }}
                    type="button"
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. Meet with James at Starbucks on 5th Avenue next Monday at 10am for coffee"
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Be as specific as possible with dates, times, and
                        locations
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Timezone</FormLabel>
                        <FormControl>
                          <Input {...field} readOnly />
                        </FormControl>
                        <FormDescription>
                          We'll use this to create events in your local time
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Priority</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-blue-400"></div>
                                <span>Low Priority</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="medium">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-green-400"></div>
                                <span>Medium Priority</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="high">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-red-400"></div>
                                <span>High Priority</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Priority affects how smart scheduling resolves
                          conflicts
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="smart_scheduling"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <FormLabel className="mb-0">
                            Smart Scheduling
                          </FormLabel>
                          <div className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            AI-powered
                          </div>
                        </div>
                        <FormDescription>
                          Automatically adjust event times to avoid conflicts
                          with existing events
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      {error.message ||
                        'Failed to generate the event. Please try again with more details.'}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || generating}
                >
                  {isLoading || generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Event'
                  )}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="preview">
            {generatedEvent && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded-full ring-2 ring-offset-2 transition-colors"
                    style={{
                      backgroundColor: generatedEvent.color || 'blue',
                    }}
                  />
                  <h2 className="text-xl font-semibold tracking-tight">
                    {generatedEvent.title}
                  </h2>

                  {/* Priority badge */}
                  {generatedEvent.priority && (
                    <div
                      className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                        generatedEvent.priority === 'high'
                          ? 'bg-red-100 text-red-800'
                          : generatedEvent.priority === 'low'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {generatedEvent.priority.charAt(0).toUpperCase() +
                        generatedEvent.priority.slice(1)}{' '}
                      Priority
                    </div>
                  )}
                </div>

                {generatedEvent.scheduling_note && (
                  <Alert className="border-primary/20 bg-primary/10">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-primary"
                        >
                          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
                          <path d="m9 12 2 2 4-4"></path>
                        </svg>
                      </div>
                      <div>
                        <AlertTitle className="mb-1 text-primary">
                          Smart Scheduling Adjusted This Event
                        </AlertTitle>
                        <AlertDescription className="text-primary/80">
                          {generatedEvent.scheduling_note}
                        </AlertDescription>
                      </div>
                    </div>
                  </Alert>
                )}

                <div className="rounded-lg border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md">
                  <div className="flex flex-col gap-4">
                    {/* Date Header */}
                    <div className="group flex items-center gap-3">
                      <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border bg-background shadow-sm transition-all duration-200 group-hover:scale-105 group-hover:border-primary/50 group-hover:shadow-md">
                        <span className="text-sm font-medium text-muted-foreground">
                          {format(new Date(generatedEvent.start_at), 'EEE')}
                        </span>
                        <span className="text-2xl font-bold">
                          {format(new Date(generatedEvent.start_at), 'd')}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-lg font-medium">
                          {format(
                            new Date(generatedEvent.start_at),
                            'MMMM yyyy'
                          )}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                          {generatedEvent.is_all_day ? (
                            'All day'
                          ) : (
                            <>
                              {format(
                                new Date(generatedEvent.start_at),
                                'h:mm a'
                              )}{' '}
                              -{' '}
                              {format(
                                new Date(generatedEvent.end_at),
                                'h:mm a'
                              )}
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Duration */}
                      {!generatedEvent.is_all_day && (
                        <div className="group rounded-md border bg-background p-3 transition-all duration-200 hover:scale-102 hover:border-primary/50 hover:shadow-sm">
                          <h3 className="text-sm font-medium text-muted-foreground">
                            Duration
                          </h3>
                          <p className="mt-1 font-medium">
                            {(() => {
                              const durationMs =
                                new Date(generatedEvent.end_at).getTime() -
                                new Date(generatedEvent.start_at).getTime();
                              const minutes = Math.floor(
                                durationMs / (1000 * 60)
                              );
                              const hours = Math.floor(minutes / 60);
                              const remainingMinutes = minutes % 60;

                              if (hours > 0) {
                                return `${hours} ${hours === 1 ? 'hour' : 'hours'}${
                                  remainingMinutes > 0
                                    ? ` ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`
                                    : ''
                                }`;
                              }
                              return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
                            })()}
                          </p>
                        </div>
                      )}

                      {/* Location */}
                      {generatedEvent.location && (
                        <div className="group rounded-md border bg-background p-3 transition-all duration-200 hover:scale-102 hover:border-primary/50 hover:shadow-sm">
                          <h3 className="text-sm font-medium text-muted-foreground">
                            Location
                          </h3>
                          <p className="mt-1 font-medium">
                            {generatedEvent.location}
                          </p>
                        </div>
                      )}

                      {/* Description */}
                      {generatedEvent.description && (
                        <div className="group rounded-md border bg-background p-3 transition-all duration-200 hover:scale-102 hover:border-primary/50 hover:shadow-sm sm:col-span-2">
                          <h3 className="text-sm font-medium text-muted-foreground">
                            Description
                          </h3>
                          <p className="mt-1 font-medium whitespace-pre-wrap">
                            {generatedEvent.description}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Timeline visualization with overlapping events */}
                    {!generatedEvent.is_all_day && (
                      <div className="mt-4">
                        {(() => {
                          // Get precise time values including minutes
                          const startDate = new Date(generatedEvent.start_at);
                          const endDate = new Date(generatedEvent.end_at);

                          // Calculate time in minutes for more precise positioning
                          const startTimeMinutes =
                            startDate.getHours() * 60 + startDate.getMinutes();
                          const endTimeMinutes =
                            endDate.getHours() * 60 + endDate.getMinutes();

                          // Calculate window with padding
                          const durationMinutes =
                            endTimeMinutes - startTimeMinutes;
                          // Adjust padding based on duration to ensure proper zoom
                          const paddingMinutes = Math.min(
                            120, // Max 2 hours padding
                            Math.max(
                              30, // Min 30 minutes padding
                              durationMinutes * 0.2 // 20% of duration
                            )
                          );

                          // Ensure window boundaries align with 30-minute intervals
                          const windowStartMinutes = Math.max(
                            0,
                            Math.floor(
                              (startTimeMinutes - paddingMinutes) / 30
                            ) * 30
                          );
                          const windowEndMinutes = Math.min(
                            24 * 60,
                            Math.ceil((endTimeMinutes + paddingMinutes) / 30) *
                              30
                          );
                          const windowDurationMinutes =
                            windowEndMinutes - windowStartMinutes;

                          // Calculate positions with grid-cell alignment
                          const startGridCell = Math.floor(
                            (startTimeMinutes - windowStartMinutes) / 30
                          );
                          const endGridCell = Math.ceil(
                            (endTimeMinutes - windowStartMinutes) / 30
                          );

                          const startPercent =
                            ((startGridCell * 30) / windowDurationMinutes) *
                            100;
                          const durationPercent =
                            (((endGridCell - startGridCell) * 30) /
                              windowDurationMinutes) *
                            100;

                          // Generate time markers at 30-minute intervals
                          const markers = Array.from(
                            {
                              length: Math.ceil(windowDurationMinutes / 30) + 1,
                            },
                            (_, i) => windowStartMinutes + i * 30
                          );

                          return (
                            <div className="space-y-2">
                              <h3 className="text-sm font-medium text-muted-foreground">
                                Schedule Timeline
                              </h3>
                              <div className="relative h-32 rounded-md border bg-card/50 p-4 transition-all duration-200 hover:border-primary/50">
                                {/* Grid lines aligned with 30-minute intervals */}
                                <div className="absolute inset-x-4 top-4 bottom-8">
                                  <div className="relative h-full w-full">
                                    {markers.map((minutes) => (
                                      <div
                                        key={minutes}
                                        className="absolute h-full w-px bg-border/30"
                                        style={{
                                          left: `${((minutes - windowStartMinutes) / windowDurationMinutes) * 100}%`,
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>

                                {/* Overlapping events */}
                                {overlappingEvents.map((event, index) => {
                                  const eventStart = new Date(event.start_at);
                                  const eventEnd = new Date(event.end_at);

                                  const eventStartMinutes =
                                    eventStart.getHours() * 60 +
                                    eventStart.getMinutes();
                                  const eventEndMinutes =
                                    eventEnd.getHours() * 60 +
                                    eventEnd.getMinutes();

                                  // Skip if outside our window
                                  if (
                                    eventEndMinutes < windowStartMinutes ||
                                    eventStartMinutes > windowEndMinutes
                                  ) {
                                    return null;
                                  }

                                  // Clamp to window boundaries
                                  const clampedStartMinutes = Math.max(
                                    eventStartMinutes,
                                    windowStartMinutes
                                  );
                                  const clampedEndMinutes = Math.min(
                                    eventEndMinutes,
                                    windowEndMinutes
                                  );

                                  const eventStartPercent =
                                    ((clampedStartMinutes -
                                      windowStartMinutes) /
                                      windowDurationMinutes) *
                                    100;
                                  const eventDurationPercent =
                                    ((clampedEndMinutes - clampedStartMinutes) /
                                      windowDurationMinutes) *
                                    100;

                                  return (
                                    <div
                                      key={event.id || index}
                                      className="absolute h-8 rounded-md border border-gray-300 bg-gray-100/80 shadow-sm"
                                      style={{
                                        left: `calc(${eventStartPercent}% - 0.75rem)`,
                                        width: `calc(${Math.max(eventDurationPercent, 2)}% - 0.5rem)`,
                                        top: '1rem',
                                        transform: 'translateX(1rem)',
                                        opacity: 0.7,
                                      }}
                                    >
                                      <div className="truncate px-2 py-1 text-xs font-medium">
                                        {event.title || 'Untitled Event'}
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* New event time block with improved positioning */}
                                <div
                                  className="absolute z-10 h-10 rounded-md border border-primary/40 bg-primary/20 shadow-sm transition-all duration-300 ease-in-out hover:bg-primary/30"
                                  style={{
                                    left: `calc(${startPercent}% - 0.75rem)`,
                                    width: `calc(${Math.max(durationPercent, 2)}% - 0.5rem)`,
                                    top: '1rem',
                                    transform: 'translateX(1rem)',
                                  }}
                                >
                                  {/* Time labels */}
                                  <div
                                    className={`absolute -top-7 ${startPercent > 70 ? 'right-0' : 'left-0'}`}
                                  >
                                    <div className="rounded-md bg-primary/90 px-2 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                                      {format(startDate, 'h:mm a')}
                                    </div>
                                  </div>
                                  <div className="truncate px-2 py-1 text-xs font-medium text-primary">
                                    {generatedEvent.title}
                                  </div>
                                </div>

                                {/* Time markers */}
                                <div className="absolute inset-x-4 bottom-0 flex justify-between">
                                  {markers.map((minutes) => {
                                    const hours = Math.floor(minutes / 60);
                                    const mins = minutes % 60;
                                    const isHalfHour = mins === 30;
                                    return (
                                      <div
                                        key={minutes}
                                        className="flex flex-col items-center"
                                        style={{
                                          position: 'absolute',
                                          left: `${((minutes - windowStartMinutes) / windowDurationMinutes) * 100}%`,
                                          transform: 'translateX(-50%)',
                                        }}
                                      >
                                        <div
                                          className="w-px bg-border"
                                          style={{
                                            height: isHalfHour ? '6px' : '12px',
                                          }}
                                        />
                                        {!isHalfHour && (
                                          <span className="mt-1 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                                            {hours === 0
                                              ? '12am'
                                              : hours < 12
                                                ? `${hours}am`
                                                : hours === 12
                                                  ? '12pm'
                                                  : `${hours - 12}pm`}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Current time indicator if event is today */}
                                {(() => {
                                  const now = new Date();
                                  if (
                                    now.toDateString() ===
                                      startDate.toDateString() &&
                                    windowStartMinutes <=
                                      now.getHours() * 60 + now.getMinutes() &&
                                    now.getHours() * 60 + now.getMinutes() <=
                                      windowEndMinutes
                                  ) {
                                    const currentTimeMinutes =
                                      now.getHours() * 60 + now.getMinutes();
                                    const currentPosition =
                                      ((currentTimeMinutes -
                                        windowStartMinutes) /
                                        windowDurationMinutes) *
                                      100;
                                    return (
                                      <div
                                        className="absolute top-4 bottom-8 z-10 w-px bg-destructive/50"
                                        style={{
                                          left: `calc(${currentPosition}% + 1rem)`,
                                        }}
                                      >
                                        <div className="absolute -top-1 h-2 w-2 -translate-x-1 animate-pulse rounded-full bg-destructive" />
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>

                              {/* Overlap status */}
                              {overlappingEvents.length > 0 &&
                                !generatedEvent.scheduling_note && (
                                  <Alert variant="destructive" className="mt-2">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Scheduling Conflict</AlertTitle>
                                    <AlertDescription>
                                      This event overlaps with{' '}
                                      {overlappingEvents.length} existing{' '}
                                      {overlappingEvents.length === 1
                                        ? 'event'
                                        : 'events'}
                                      . Enable smart scheduling to automatically
                                      resolve conflicts.
                                    </AlertDescription>
                                  </Alert>
                                )}

                              {overlappingEvents.length === 0 && (
                                <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
                                    <path d="m9 12 2 2 4-4"></path>
                                  </svg>
                                  <span>No scheduling conflicts detected</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6 flex items-center justify-between">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {activeTab === 'preview' && generatedEvent && (
            <div className="flex gap-2">
              {overlappingEvents.length > 0 &&
                !generatedEvent.scheduling_note && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      form.setValue('smart_scheduling', true);
                      form.handleSubmit(onSubmit)();
                    }}
                  >
                    Resolve Conflicts
                  </Button>
                )}
              <Button onClick={handleSaveToCalendar}>Save to Calendar</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
