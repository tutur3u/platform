'use client';

import { useCalendar } from '../../../../hooks/use-calendar';
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
} from './EventFormComponents';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { format } from 'date-fns';
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
  Link,
  Loader2,
  Lock,
  MapPin,
  Mic,
  Settings,
  Sparkles,
  StopCircle,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

interface ExtendedCalendarEvent extends CalendarEvent {
  _originalId?: string;
  _isMultiDay?: boolean;
  _dayPosition?: 'start' | 'middle' | 'end';
}

const AIFormSchema = z.object({
  prompt: z.string().min(1, 'Please enter a prompt to generate an event'),
  timezone: z
    .string()
    .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  smart_scheduling: z.boolean().default(true),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

export function UnifiedEventModal({
  wsId,
  experimentalGoogleCalendarLinked = false,
  enableExperimentalGoogleCalendar = false,
}: {
  wsId: string;
  experimentalGoogleCalendarLinked?: boolean;
  enableExperimentalGoogleCalendar?: boolean;
}) {
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
    settings,
  } = useCalendar();

  const [isGoogleAuthenticating, setIsGoogleAuthenticating] = useState(false);

  const handleGoogleAuth = async () => {
    setIsGoogleAuthenticating(true);
    try {
      const response = await fetch(`/api/v1/calendar/auth?wsId=${wsId}`, {
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

  // State for manual event creation/editing
  const [event, setEvent] = useState<Partial<CalendarEvent>>({
    title: '',
    description: '',
    start_at: new Date().toISOString(),
    end_at: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString(), // Default to 1 hour
    color: 'BLUE',
    location: '',
    priority: 'medium',
    locked: false,
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

      setGeneratedEvents(processedEvents);
      setCurrentEventIndex(0);

      // Find overlapping events for the first event
      if (processedEvents.length > 0 && aiForm.getValues().smart_scheduling) {
        const firstEvent = processedEvents[0];
        if (firstEvent && firstEvent.start_at && firstEvent.end_at) {
          checkForOverlaps(firstEvent as Partial<CalendarEvent>);
        }
      }

      setActiveTab('preview');
    }
  }, [object, isLoading, settings?.categoryColors?.categories]);

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
        locked: false,
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
    } catch (error) {
      console.error('Error generating events:', error);
      toast({
        title: 'Error generating events',
        description: 'Please try again with a different prompt',
        variant: 'destructive',
      });
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
          locked: false, // Default to unlocked for AI-generated events
        };

        const savedEvent = await addEvent(calendarEvent);
        savedEvents.push(savedEvent);
        await syncWithGoogleCalendar(savedEvent);
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
    if (isRecording) {
      console.log('🛑 Cancel recording due to event deletion');
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
          console.error('No recording data!');
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
            console.error('Error when converting audio to base64');
            setIsProcessingAudio(false);
            return;
          }

          console.log('Sending Base64 Audio to server...');
          sendAudioToServer(base64Audio);
        };

        // Cleanup
        revokeMediaPermissions();
        audioChunks.current = [];
      };

      mediaRecorder.current.start();
    } catch (error) {
      console.error('Error accessing microphone:', error);
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
        console.log('Transcribed text:', result.text);
        aiForm.setValue('prompt', result.text);
      } else {
        console.error('Failed to transcribe audio:', result.error);
        toast({
          title: 'Transcription Error',
          description: result.error || 'Failed to transcribe audio',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error calling API:', error);
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
        console.error('Error when changing image to base64');
        setIsProcessingImage(false);
        return;
      }

      console.log('Uploading Base64 Image to server...');

      try {
        const response = await fetch('/api/v1/calendar/image', {
          // send to API
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image }),
        });

        const result = await response.json();
        if (result.text) {
          console.log('Extracted text from image:', result.text);
          aiForm.setValue('prompt', result.text);
        } else {
          console.error('Failed to extract text from image:', result.error);
          toast({
            title: 'Image Processing Error',
            description: result.error || 'Failed to extract text from image',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Error when sending image to server:', error);
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
              value="ai"
              className="rounded-t-md rounded-b-none border-b-0 px-4 py-2 data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              disabled={!!isEditing}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              className="rounded-t-md rounded-b-none border-b-0 px-4 py-2 data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              Manual
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
                    {/* Locked Event Indicator */}
                    {event.locked && (
                      <div className="mb-4 flex items-center gap-2 rounded-md border border-dynamic-light-yellow/30 bg-dynamic-light-yellow/10 p-3 text-dynamic-light-yellow">
                        <div>
                          <h3 className="font-semibold">Event is Locked</h3>
                          <p className="text-sm">
                            This event is locked and can't be modified. Unlock
                            it from the Advanced Settings section to make
                            changes.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Title */}
                    <EventTitleInput
                      value={event.title || ''}
                      onEnter={handleManualSave}
                      onChange={(value) => setEvent({ ...event, title: value })}
                      disabled={event.locked}
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
                            disabled={event.locked}
                          />
                          <EventToggleSwitch
                            id="multi-day"
                            label="Multi-Day"
                            checked={isMultiDay}
                            onChange={handleMultiDayChange}
                            disabled={event.locked}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <EventDateTimePicker
                          label="Start"
                          value={new Date(event.start_at || new Date())}
                          onChange={handleStartDateChange}
                          disabled={event.locked}
                        />
                        <EventDateTimePicker
                          label="End"
                          value={new Date(event.end_at || new Date())}
                          onChange={handleEndDateChange}
                          disabled={event.locked}
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
                        disabled={event.locked}
                      />
                      <EventDescriptionInput
                        value={event.description || ''}
                        onChange={(value) =>
                          setEvent({ ...event, description: value })
                        }
                        disabled={event.locked}
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
                                disabled={event.locked}
                              />
                              <div className="flex flex-col space-y-3">
                                <label className="text-sm font-medium">
                                  Event Protection
                                </label>
                                <EventToggleSwitch
                                  id="locked"
                                  label="Lock Event"
                                  description="Locked events cannot be modified accidentally"
                                  checked={event.locked || false}
                                  onChange={(checked) =>
                                    setEvent({ ...event, locked: checked })
                                  }
                                />
                                <div className="mt-1 flex items-center gap-2">
                                  {event.locked ? (
                                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                  <p className="text-xs text-muted-foreground">
                                    {event.locked
                                      ? 'Event is locked'
                                      : 'Event is unlocked'}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              <p className="flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                Color and protection settings help organize and
                                secure your events
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
                      {isEditing ||
                        (enableExperimentalGoogleCalendar && (
                          <Button
                            variant="outline"
                            onClick={handleGoogleAuth}
                            disabled={
                              experimentalGoogleCalendarLinked ||
                              isGoogleAuthenticating
                            }
                          >
                            {experimentalGoogleCalendarLinked ? (
                              <>
                                <Link className="h-4 w-4" />
                                <span>Google Calendar Linked</span>
                              </>
                            ) : isGoogleAuthenticating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Link Google Calendar'
                            )}
                          </Button>
                        ))}

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
                        disabled={isSaving || isDeleting || event.locked}
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
                              {isEditing
                                ? event.locked
                                  ? 'Locked'
                                  : 'Update'
                                : 'Create'}
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
                        <FormField
                          control={aiForm.control}
                          name="prompt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base font-medium">
                                Describe your event
                              </FormLabel>
                              <FormControl>
                                <div className="relative w-full">
                                  <AutosizeTextarea
                                    {...field}
                                    autoFocus
                                    placeholder="E.g., Schedule a team meeting next Monday at 2pm for 1 hour..."
                                    className="min-h-[200px] w-full resize-none rounded-md border border-input bg-background p-4 pr-20 text-base focus:ring-1 focus:ring-ring focus:outline-none"
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
                              <p className="text-sm text-muted-foreground">
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
              className="h-full p-0 focus-visible:ring-0 focus-visible:outline-none data-[state=active]:flex data-[state=active]:flex-col"
              style={{ display: activeTab === 'preview' ? 'flex' : 'none' }}
            >
              <div className="flex flex-1 flex-col overflow-hidden">
                <ScrollArea className="h-[calc(90vh-250px)] flex-1">
                  <div className="space-y-6 p-6">
                    {/* AI Generated Event Preview */}
                    <div className="rounded-lg border bg-muted/10 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-base font-medium">
                          <Sparkles className="h-4 w-4 text-primary" />
                          AI Generated Event
                          {generatedEvents.length > 1 ? 's' : ''}
                        </h3>
                        <div className="flex items-center gap-2">
                          {generatedEvents.length > 1 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
                          <div className="mt-3 space-y-3 rounded-md border p-3">
                            <div className="space-y-2">
                              <h4 className="text-lg font-medium">
                                {generatedEvent.title}
                              </h4>
                              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
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
                                    <button
                                      onClick={() =>
                                        openGoogleMaps(generatedEvent.location)
                                      }
                                      className="text-sm text-muted-foreground hover:text-primary hover:underline"
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
                                <h5 className="text-sm font-medium">
                                  Description
                                </h5>
                                <p className="text-sm text-muted-foreground">
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
                                        className={`text-xs font-medium ${text}`}
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
                              <span className="text-xs text-muted-foreground">
                                Event will be created unlocked
                              </span>
                            </div>
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
                      <div className="rounded-lg border bg-muted/10 p-4">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <Brain className="h-4 w-4 text-primary" />
                          AI Insights & Suggestions
                        </h3>
                        <ul className="space-y-2">
                          {aiSuggestions.map((suggestion, index) => (
                            <li
                              key={index}
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
