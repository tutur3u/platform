'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { calendarEventsSchema } from '@tuturuuu/ai/calendar/events';
import { useObject } from '@tuturuuu/ai/object/core';
import {
  AlertCircle,
  Brain,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  MapPin,
  Mic,
  Sparkles,
  StopCircle,
  Trash2,
  Unlock,
  X,
} from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
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
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  createAllDayEvent,
  isAllDayEvent,
} from '@tuturuuu/utils/calendar-utils';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import ts from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '../../alert';
import { AutosizeTextarea } from '../../custom/autosize-textarea';
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
} from './event-form-components';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(ts);
dayjs.extend(utc);

const AIFormSchema = z.object({
  prompt: z.string().min(1, 'Please enter a prompt to generate an event'),
  timezone: z
    .string()
    .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  smart_scheduling: z.boolean().default(true),
});

export function EventModal() {
  const { toast } = useToast();
  const startPickerRef = useRef<HTMLButtonElement>(null);
  const endPickerRef = useRef<HTMLButtonElement>(null);

  const {
    activeEvent,
    isModalOpen,
    closeModal,
    addEvent,
    updateEvent,
    deleteEvent,
    getEvents,
    defaultNewEventTab,
  } = useCalendar();
  const { settings } = useCalendarSettings();

  const tz = settings?.timezone?.timezone;

  // State for manual event creation/editing
  const [event, setEvent] = useState<Partial<CalendarEvent>>({
    title: '',
    description: '',
    start_at: new Date().toISOString(),
    end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Default to 1 hour
    color: 'BLUE',
    location: '',
    locked: false,
  });

  // State for AI event generation
  const [generatedEvents, setGeneratedEvents] =
    useState<Partial<CalendarEvent>[]>();
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [userTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Get the current event being previewed
  const generatedEvent = generatedEvents?.[currentEventIndex];

  // Determine if we're editing an existing event
  const isEditing = !!(activeEvent?.id && activeEvent.id !== 'new');

  // Shared state
  const [activeTab, setActiveTab] = useState<'manual' | 'ai' | 'preview'>(
    isEditing ? 'manual' : defaultNewEventTab // Default tab for new events
  );
  const [isAllDay, setIsAllDay] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [overlappingEvents, setOverlappingEvents] = useState<CalendarEvent[]>(
    []
  );
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  // Store previous time values for toggling all-day
  const [prevTimes, setPrevTimes] = useState<{
    timed: { start: string | null; end: string | null };
    allday: { start: string | null; end: string | null };
  }>({ timed: { start: null, end: null }, allday: { start: null, end: null } });

  // AI form
  const aiForm = useForm({
    resolver: zodResolver(AIFormSchema),
    defaultValues: {
      prompt: '',
      timezone: userTimezone,
      smart_scheduling: true,
    },
  });

  // AI generation
  const { object, submit, error, isLoading } = useObject({
    api: '/api/v1/calendar/events/generate',
    schema: calendarEventsSchema,
  });

  // Function to check for overlapping events
  const checkForOverlaps = useCallback(
    (eventToCheck: Partial<CalendarEvent>) => {
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
    },
    [activeEvent, getEvents]
  );

  // Handle AI-generated events
  useEffect(() => {
    if (object?.events && !isLoading) {
      // Process the generated events
      const processedEvents = (object.events || []) as Partial<CalendarEvent>[];

      setGeneratedEvents(processedEvents);
      setCurrentEventIndex(0);

      // Find overlapping events for the first event
      if (processedEvents.length > 0 && aiForm.getValues().smart_scheduling) {
        const firstEvent = processedEvents[0];
        if (firstEvent?.start_at && firstEvent.end_at) {
          checkForOverlaps(firstEvent as Partial<CalendarEvent>);
        }
      }

      setActiveTab('preview');
    }
  }, [object, isLoading, aiForm, checkForOverlaps]);

  // Reset form when modal opens/closes or active event changes
  useEffect(() => {
    if (activeEvent) {
      // Clean the event data to only include valid CalendarEvent fields
      const cleanEventData: Partial<CalendarEvent> = {
        id: activeEvent.id,
        title: activeEvent.title || '',
        description: activeEvent.description || '',
        start_at: activeEvent.start_at,
        end_at: activeEvent.end_at,
        color: activeEvent.color || 'BLUE',
        location: activeEvent.location || '',
        locked: activeEvent.locked || false,
        ws_id: activeEvent.ws_id,
        google_event_id: activeEvent.google_event_id,
      };

      setEvent(cleanEventData);

      // Only check for all-day if this is an existing event (not a new one)
      if (activeEvent.id !== 'new') {
        setIsAllDay(isAllDayEvent(cleanEventData as CalendarEvent));
      } else {
        // For new events, always start with isAllDay as false
        setIsAllDay(false);
      }

      // Check for overlapping events
      checkForOverlaps(cleanEventData);

      // Set active tab to manual when editing an existing event
      setActiveTab(isEditing ? 'manual' : defaultNewEventTab);
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
        locked: false,
      };

      setEvent(newEvent);
      setIsAllDay(false);

      // Reset AI form
      aiForm.reset();
      setGeneratedEvents([]);
    }

    // Clear any error messages
    setDateError(null);
  }, [activeEvent, checkForOverlaps, aiForm, defaultNewEventTab, isEditing]);

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
      // Clean event data to only include fields that should be updated
      const eventData: Partial<CalendarEvent> = {
        title: event.title || '',
        description: event.description || '',
        start_at: event.start_at,
        end_at: event.end_at,
        color: event.color || 'BLUE',
        location: event.location || '',
        locked: event.locked || false,
      };

      if (activeEvent?.id === 'new') {
        await addEvent(eventData as Omit<CalendarEvent, 'id'>);
      } else if (activeEvent?.id) {
        // For multi-day events, always use the original event ID
        // The activeEvent should already contain the original event from the database
        const eventId = activeEvent.id;

        if (eventId && eventId !== 'new') {
          await updateEvent(eventId, eventData);
        } else {
          throw new Error('Invalid event ID');
        }
      } else {
        throw new Error('No event to save');
      }

      closeModal();
    } catch (_) {
      toast({
        title: 'Error',
        description: 'Failed to save or sync event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle AI event generation
  const handleGenerateEvent = async (values: z.infer<typeof AIFormSchema>) => {
    try {
      // Include timezone in the prompt for accurate time conversion
      const promptWithTimezone = `${values.prompt}\n\nUser timezone: ${values.timezone}`;

      // Get existing events for smart scheduling
      const existingEvents = values.smart_scheduling ? getEvents() : [];

      // Generate helpful suggestions based on the prompt
      const suggestions = [
        'Consider adding a buffer time before/after these events',
        'These events might benefit from reminder notifications',
        'Based on your schedule, early morning might be better for focus',
        'Consider adding meeting agenda or preparation notes',
      ];

      // Add category-based suggestions
      if (settings?.categoryColors?.categories.length > 0) {
        const categoryNames = settings.categoryColors.categories
          .map((cat) => cat.name)
          .join(', ');
        suggestions.push(
          `You have categories set up: ${categoryNames}. Events will be colored based on these categories.`
        );
      }

      setAiSuggestions(suggestions.slice(0, 3)); // Show up to 3 relevant suggestions

      // Format categories for the AI request
      const formattedCategories = settings?.categoryColors?.categories.map(
        (category) => ({
          name: category.name,
          color: category.color.toLowerCase(),
        })
      );

      submit({
        prompt: promptWithTimezone,
        current_time: new Date().toISOString(),
        smart_scheduling: values.smart_scheduling,
        existing_events: values.smart_scheduling ? existingEvents : undefined,
        categories: formattedCategories,
      });
    } catch (_) {
      toast({
        title: 'Error generating events',
        description: 'Please try again with a different prompt',
        variant: 'destructive',
      });
    }
  };

  // Handle AI event save
  const handleAISave = async () => {
    if (generatedEvents?.length === 0) return;

    setIsSaving(true);
    try {
      const eventsToSave = generatedEvents;
      const savedEvents: CalendarEvent[] = [];
      const failedEvents: Array<{ event: CalendarEvent; error: unknown }> = [];

      // Save each event individually
      for (const eventData of eventsToSave || []) {
        try {
          const calendarEvent: Omit<CalendarEvent, 'id'> = {
            title: eventData.title || 'New Event',
            description: eventData.description || '',
            start_at: eventData.start_at || '',
            end_at: eventData.end_at || '',
            color: eventData.color || 'BLUE',
            location: eventData.location || '',
            locked: eventData.locked || false,
          };

          const savedEvent = await addEvent(calendarEvent);
          if (savedEvent) savedEvents.push(savedEvent);
        } catch (error) {
          failedEvents.push({ event: eventData as CalendarEvent, error });
        }
      }

      // Show success notification
      if (savedEvents.length > 0) {
        toast({
          title: 'Success',
          description: `${savedEvents.length}/${eventsToSave?.length || 0} event${savedEvents.length > 1 ? 's' : ''} saved`,
        });
        closeModal();
      }

      // If there are failed events, show an error notification
      if (failedEvents.length > 0) {
        toast({
          title: 'Warning',
          description: `${failedEvents.length} event${failedEvents.length > 1 ? 's' : ''} failed to save`,
          variant: 'destructive',
        });
      }
    } catch (_) {
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
    if (isRecording) {
      stopRecording();
    }
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
    } catch (_) {
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
      const newStartDate = tz === 'auto' ? dayjs(date) : dayjs(date).tz(tz);
      const endDate =
        tz === 'auto'
          ? dayjs(prev.end_at || '')
          : dayjs(prev.end_at || '').tz(tz);
      const newEvent = { ...prev, start_at: date.toISOString() };

      if (isAllDay) {
        // For all-day, keep end_at as is if it's after or equal to start_at + 1 day, otherwise set to start + 1 day
        newEvent.start_at = newStartDate.startOf('day').toISOString();
        let newEnd = dayjs(prev.end_at).isValid()
          ? dayjs(prev.end_at)
          : newStartDate.startOf('day').add(1, 'day');
        if (!newEnd.isAfter(newStartDate.startOf('day'))) {
          newEnd = newStartDate.startOf('day').add(1, 'day');
        }
        newEvent.end_at = newEnd.toISOString();
      } else {
        // If end time is before or equal to new start time, set end time to 1 hour after start
        if (!endDate.isAfter(newStartDate)) {
          const plusOneHour = newStartDate.add(1, 'hour');
          if (plusOneHour.date() !== newStartDate.date()) {
            newEvent.end_at = plusOneHour.toISOString();
          } else {
            newEvent.end_at = plusOneHour.toISOString();
          }
        }
      }

      // Only show error if end <= start
      if (
        dayjs(newEvent.end_at).isSame(dayjs(newEvent.start_at)) ||
        dayjs(newEvent.end_at).isBefore(dayjs(newEvent.start_at))
      ) {
        setDateError('End time must be after start time.');
      } else {
        setDateError(null);
      }
      return newEvent;
    });
  };

  // Handle end date change
  const handleEndDateChange = (date: Date | undefined) => {
    if (!date) return;

    setEvent((prev) => {
      let newEndDate = tz === 'auto' ? dayjs(date) : dayjs(date).tz(tz);
      const startDate =
        tz === 'auto'
          ? dayjs(prev.start_at || '')
          : dayjs(prev.start_at || '').tz(tz);
      const newEvent = { ...prev };

      if (isAllDay) {
        // For all-day, set end_at to the start of the day after the selected end date
        let newEnd = newEndDate.startOf('day').add(1, 'day');
        // Ensure end is not before or equal to start
        if (!newEnd.isAfter(startDate.startOf('day'))) {
          newEnd = startDate.startOf('day').add(1, 'day');
        }
        newEvent.end_at = newEnd.toISOString();
        // Don't change start_at here
      } else {
        // If end is not after start, increment end date by one day and set the entered time
        if (!newEndDate.isAfter(startDate)) {
          // Use the time from the user's input, but increment the date by one day
          newEndDate = newEndDate.add(1, 'day');
        }
        // If end is after start, accept as is
        newEvent.end_at = newEndDate.toISOString();
      }

      if (!dayjs(newEvent.end_at).isAfter(dayjs(newEvent.start_at))) {
        setDateError('End time must be after start time.');
      } else {
        setDateError(null);
      }

      return newEvent;
    });
  };

  // Handle all-day toggle
  const handleAllDayChange = (checked: boolean) => {
    setEvent((prev) => {
      const startDate =
        tz === 'auto' ? dayjs(prev.start_at) : dayjs(prev.start_at).tz(tz);
      // Backup previous times before updating
      const timedBackup = prevTimes.timed;
      const alldayBackup = prevTimes.allday;
      if (checked) {
        setPrevTimes((old) => ({
          ...old,
          timed: { start: prev.start_at || null, end: prev.end_at || null },
        }));
        // Restore previous all-day range if it exists
        if (alldayBackup.start && alldayBackup.end) {
          return {
            ...prev,
            start_at: alldayBackup.start,
            end_at: alldayBackup.end,
          };
        }
        // Use the new createAllDayEvent helper for proper timezone handling
        const { start_at, end_at } = createAllDayEvent(
          startDate.toDate(),
          tz,
          1 // 1 day duration
        );
        return {
          ...prev,
          start_at,
          end_at,
        };
      } else {
        setPrevTimes((old) => ({
          ...old,
          allday: { start: prev.start_at || null, end: prev.end_at || null },
        }));
        // Restore previous timed range if it exists
        if (timedBackup.start && timedBackup.end) {
          return {
            ...prev,
            start_at: timedBackup.start,
            end_at: timedBackup.end,
          };
        }
        const newStart =
          tz === 'auto'
            ? dayjs().startOf('hour')
            : dayjs().startOf('hour').tz(tz);
        const newEnd = newStart.add(1, 'hour');
        return {
          ...prev,
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
        };
      }
    });
    setIsAllDay((prev) => !prev);
  };

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    setIsRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = async () => {
        if (audioChunks.current.length === 0) {
          setIsRecording(false);
          setIsProcessingAudio(false);
          return;
        }

        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const reader = new FileReader();

        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result?.toString().split(',')[1];

          if (!base64Audio) {
            setIsProcessingAudio(false);
            return;
          }

          sendAudioToServer(base64Audio);
        };

        // Cleanup
        revokeMediaPermissions();
        audioChunks.current = [];
      };

      mediaRecorder.current.start();
    } catch (_) {
      setIsRecording(false);
    }
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsProcessingAudio(true);
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    } else {
      revokeMediaPermissions();
      setIsProcessingAudio(false);
    }
  };

  const revokeMediaPermissions = () => {
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStream.current = null;
    }
  };

  const sendAudioToServer = async (base64Audio: string) => {
    try {
      const response = await fetch('/api/v1/calendar/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Audio }),
      });

      const result = await response.json();
      if (result.text) {
        aiForm.setValue('prompt', result.text);
      } else {
        toast({
          title: 'Transcription Error',
          description: result.error || 'Failed to transcribe audio',
          variant: 'destructive',
        });
      }
    } catch (_) {
      toast({
        title: 'API Error',
        description: 'Failed to process audio recording',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const handleUploadImage = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]; // image file from input
    if (!file) return;

    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64Image = reader.result?.toString().split(',')[1]; // convert to base64
      if (!base64Image) {
        setIsProcessingImage(false);
        return;
      }

      try {
        const response = await fetch('/api/v1/calendar/image', {
          // send to API
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image }),
        });

        const result = await response.json();
        if (result.text) {
          aiForm.setValue('prompt', result.text);
        } else {
          toast({
            title: 'Image Processing Error',
            description: result.error || 'Failed to extract text from image',
            variant: 'destructive',
          });
        }
      } catch (_) {
        toast({
          title: 'API Error',
          description: 'Failed to process uploaded image',
          variant: 'destructive',
        });
      } finally {
        setIsProcessingImage(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
  };

  // Handle navigation between multiple events in preview
  const goToNextEvent = () => {
    if (currentEventIndex < (generatedEvents?.length || 0) - 1) {
      const nextIndex = currentEventIndex + 1;
      setCurrentEventIndex(nextIndex);
      if (aiForm.getValues().smart_scheduling) {
        const nextEvent = generatedEvents?.[nextIndex];
        if (nextEvent?.start_at && nextEvent.end_at) {
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
        const prevEvent = generatedEvents?.[prevIndex];
        if (prevEvent?.start_at && prevEvent.end_at) {
          checkForOverlaps(prevEvent as Partial<CalendarEvent>);
        }
      }
    }
  };

  // function to open Google Maps with the entered address
  const openGoogleMaps = (address: string) => {
    if (address) {
      const encodedAddress = encodeURIComponent(address);
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
        '_blank'
      );
    }
  };

  // Handle lock toggle
  const handleLockToggle = async (checked: boolean) => {
    if (!activeEvent?.id) return;

    setIsSaving(true);
    try {
      const originalId = activeEvent.id;

      const updatedEvent = await updateEvent(originalId, {
        ...event,
        locked: checked,
      });

      if (!updatedEvent) {
        throw new Error('Failed to update event lock status');
      }

      setEvent(updatedEvent);
      toast({
        title: 'Success',
        description: `Event ${checked ? 'locked' : 'unlocked'} successfully`,
      });
    } catch (_) {
      toast({
        title: 'Error',
        description: 'Failed to update event lock status',
        variant: 'destructive',
      });
      // Revert the toggle if update fails
      setEvent((prev) => ({ ...prev, locked: !checked }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 font-semibold text-xl">
            <span>{isEditing ? 'Edit Event' : 'Create Event'}</span>
            {event.google_event_id &&
              typeof event.google_event_id === 'string' &&
              event.google_event_id.trim() !== '' && (
                <div className="ml-3 flex items-center gap-2 rounded-md border bg-blue-50 px-3 py-1 text-sm dark:bg-blue-950/30">
                  <Image
                    src="/media/google-calendar-icon.png"
                    alt="Google Calendar"
                    className="inline-block h-4.5 w-4.5 align-middle"
                    title="Synced from Google Calendar"
                    data-testid="google-calendar-logo"
                    width={18}
                    height={18}
                  />
                  <span className="font-medium text-xs">Google Calendar</span>
                </div>
              )}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Make changes to your existing event'
              : 'Add a new event to your calendar'}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'manual' | 'ai')}
          className="flex h-[calc(90vh-140px)] flex-col"
        >
          <TabsList className="justify-start gap-2 bg-transparent px-6 pt-4 pb-0">
            <TabsTrigger
              value="manual"
              className="rounded-t-md rounded-b-none border-b-0 px-4 py-2 data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              Quick Entry
            </TabsTrigger>
            <TabsTrigger
              value="ai"
              className="rounded-t-md rounded-b-none border-b-0 px-4 py-2 data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              disabled={!!isEditing}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AI Generate
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
                  <div className="space-y-3 p-4">
                    {/* Title */}
                    <EventTitleInput
                      value={event.title || ''}
                      onEnter={handleManualSave}
                      onChange={(value) => setEvent({ ...event, title: value })}
                    />

                    {/* Date and Time Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-sm">When</h3>
                        <EventToggleSwitch
                          id="all-day"
                          label="All Day"
                          checked={isAllDay}
                          onChange={handleAllDayChange}
                        />
                      </div>

                      <div className="grid gap-3">
                        <EventDateTimePicker
                          label="Start"
                          value={new Date(event.start_at || new Date())}
                          onChange={handleStartDateChange}
                          showTimeSelect={!isAllDay}
                          scrollIntoViewOnOpen={true}
                          pickerButtonRef={startPickerRef}
                        />
                        <EventDateTimePicker
                          label="End"
                          value={(() => {
                            // For all-day, display end_at - 1 day
                            if (isAllDay && event.end_at) {
                              const end = new Date(event.end_at);
                              end.setDate(end.getDate() - 1);
                              return end;
                            }
                            return new Date(event.end_at || new Date());
                          })()}
                          onChange={handleEndDateChange}
                          showTimeSelect={!isAllDay}
                          minDate={(() => {
                            // Allow selecting the same day as the start date
                            const start = new Date(
                              event.start_at || new Date()
                            );
                            return new Date(
                              start.getFullYear(),
                              start.getMonth(),
                              start.getDate()
                            );
                          })()}
                          minTime={(() => {
                            const start = new Date(
                              event.start_at || new Date()
                            );
                            const end = new Date(event.end_at || new Date());
                            // Only apply minTime if start and end are on the same day
                            if (
                              start.getFullYear() === end.getFullYear() &&
                              start.getMonth() === end.getMonth() &&
                              start.getDate() === end.getDate()
                            ) {
                              return `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
                            }
                            return undefined;
                          })()}
                          scrollIntoViewOnOpen={true}
                          pickerButtonRef={endPickerRef}
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* Location and Description */}
                    <div className="space-y-2">
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

                      {/* Color and Options Row */}
                      <div className="flex items-end justify-between gap-4">
                        <EventColorPicker
                          value={event.color || 'BLUE'}
                          onChange={(value) =>
                            setEvent({ ...event, color: value })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newLocked = !event.locked;
                            if (isEditing) {
                              handleLockToggle(newLocked);
                            } else {
                              setEvent((prev) => ({
                                ...prev,
                                locked: newLocked,
                              }));
                            }
                          }}
                          className={cn(
                            'mb-1 flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors',
                            event.locked
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted'
                          )}
                          title={
                            event.locked
                              ? 'Locked: Auto-scheduling will not move this event'
                              : 'Unlocked: Auto-scheduling may move this event'
                          }
                        >
                          {event.locked ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5" />
                          )}
                          {event.locked ? 'Locked' : 'Unlocked'}
                        </button>
                      </div>
                    </div>

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
                <div className="mt-auto border-t p-2">
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
                      <div />
                    )}

                    <div className="flex gap-2">
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
                            <span>
                              {isEditing ? 'Save Changes' : 'Create Event'}
                            </span>
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
                        <FormField
                          control={aiForm.control}
                          name="prompt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-medium text-base">
                                Describe your event
                              </FormLabel>
                              <FormControl>
                                <div className="relative w-full">
                                  <AutosizeTextarea
                                    {...field}
                                    autoFocus
                                    placeholder="E.g., Schedule a team meeting next Monday at 2pm for 1 hour..."
                                    className="min-h-50 w-full resize-none rounded-md border border-input bg-background p-4 pr-20 text-base focus:outline-none focus:ring-1 focus:ring-ring"
                                    disabled={
                                      isLoading ||
                                      isRecording ||
                                      isProcessingAudio ||
                                      isProcessingImage
                                    }
                                  />

                                  {/* Record Button */}
                                  <div className="absolute right-2 bottom-2 flex items-center gap-1">
                                    <Button
                                      size="xs"
                                      type="button"
                                      variant={
                                        isRecording ? 'destructive' : 'default'
                                      }
                                      onClick={
                                        isRecording
                                          ? stopRecording
                                          : startRecording
                                      }
                                      disabled={
                                        isProcessingAudio ||
                                        isProcessingImage ||
                                        isLoading
                                      }
                                      className="flex items-center rounded-md"
                                    >
                                      {isRecording ? (
                                        <StopCircle className="h-4 w-4" />
                                      ) : isProcessingAudio ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Mic className="h-4 w-4" />
                                      )}
                                    </Button>

                                    {/* 📸 Image button */}
                                    <Button
                                      size="xs"
                                      type="button"
                                      variant="default"
                                      onClick={triggerImageUpload}
                                      disabled={
                                        isRecording ||
                                        isProcessingAudio ||
                                        isProcessingImage ||
                                        isLoading
                                      }
                                      className="flex items-center rounded-md"
                                    >
                                      {isProcessingImage ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <ImageIcon className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <input
                                      type="file"
                                      ref={fileInputRef}
                                      accept="image/*"
                                      onChange={handleUploadImage}
                                      className="hidden"
                                    />
                                  </div>
                                </div>
                              </FormControl>
                              <FormDescription className="flex items-center gap-1 text-xs">
                                <Info className="h-3 w-3" />
                                Be as specific as possible for best results
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {isLoading && (
                          <div className="flex items-center justify-center py-8">
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                          className="flex items-center gap-2 bg-primary"
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
                    <div className="rounded-lg border bg-muted/10 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-medium text-base">
                          <Sparkles className="h-4 w-4 text-primary" />
                          AI Generated Event
                          {(generatedEvents?.length || 0) > 1 ? 's' : ''}
                        </h3>
                        <div className="flex items-center gap-2">
                          {(generatedEvents?.length || 0) > 1 && (
                            <div className="flex items-center gap-1 text-muted-foreground text-xs">
                              <span>{currentEventIndex + 1}</span>
                              <span>/</span>
                              <span>{generatedEvents?.length || 0}</span>
                            </div>
                          )}
                          <Badge variant="outline" className="text-xs">
                            Preview
                          </Badge>
                        </div>
                      </div>

                      {generatedEvent && (
                        <div className="space-y-4">
                          <div className="mt-3 space-y-3 rounded-md border p-3">
                            <div className="space-y-2">
                              <h4 className="font-medium text-lg">
                                {generatedEvent.title}
                              </h4>
                              <div className="flex flex-wrap gap-2 text-muted-foreground text-sm">
                                <div className="flex items-center gap-1">
                                  <CalendarIcon className="h-3.5 w-3.5" />
                                  <span>
                                    {format(
                                      new Date(generatedEvent.start_at || ''),
                                      'PPP'
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>
                                    {format(
                                      new Date(generatedEvent.start_at || ''),
                                      settings?.appearance?.timeFormat === '24h'
                                        ? 'HH:mm'
                                        : 'h:mm a'
                                    )}{' '}
                                    -{' '}
                                    {format(
                                      new Date(generatedEvent.end_at || ''),
                                      settings?.appearance?.timeFormat === '24h'
                                        ? 'HH:mm'
                                        : 'h:mm a'
                                    )}
                                  </span>
                                </div>
                                {generatedEvent.location && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openGoogleMaps(
                                          generatedEvent.location || ''
                                        )
                                      }
                                      className="text-muted-foreground text-sm hover:text-primary hover:underline"
                                      title="Open in Google Maps"
                                    >
                                      {generatedEvent.location}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {generatedEvent.description && (
                              <div className="space-y-1">
                                <h5 className="font-medium text-sm">
                                  Description
                                </h5>
                                <p className="text-muted-foreground text-sm">
                                  {generatedEvent.description}
                                </p>
                              </div>
                            )}

                            <Separator />

                            {/* Color indicator and category */}
                            <div className="flex items-center gap-2">
                              {generatedEvent.color &&
                                (() => {
                                  const { bg, border, text } = getEventStyles(
                                    generatedEvent.color
                                  );
                                  return (
                                    <div
                                      className={`flex items-center gap-2 rounded-full border px-2 py-1 text-center ${bg} ${border}`}
                                    >
                                      <span
                                        className={`font-medium text-xs ${text}`}
                                      >
                                        {COLOR_OPTIONS.find(
                                          (c) =>
                                            c.value ===
                                            (generatedEvent.color
                                              ? generatedEvent.color.toUpperCase()
                                              : 'BLUE')
                                        )?.name || 'Default'}
                                      </span>
                                    </div>
                                  );
                                })()}
                            </div>

                            {/* Event protection status */}
                            <div className="flex items-center gap-2">
                              <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground text-xs">
                                Event will be created unlocked
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Navigation buttons for multiple events */}
                      {(generatedEvents?.length || 0) > 1 && (
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
                              currentEventIndex ===
                              (generatedEvents?.length || 0) - 1
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
                      <div className="rounded-lg border bg-muted/10 p-4">
                        <h3 className="mb-3 flex items-center gap-2 font-medium text-sm">
                          <Brain className="h-4 w-4 text-primary" />
                          AI Insights & Suggestions
                        </h3>
                        <ul className="space-y-2">
                          {aiSuggestions.map((suggestion) => (
                            <li
                              key={suggestion}
                              className="flex items-start gap-2 text-sm"
                            >
                              <div className="mt-0.5 text-primary">•</div>
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
                      disabled={
                        isSaving || (generatedEvents?.length || 0) === 0
                      }
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
                            {(generatedEvents?.length || 0) > 1
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
