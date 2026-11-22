'use client';

import { useQuery } from '@tanstack/react-query';
import { calendarEventsSchema } from '@tuturuuu/ai/calendar/events';
import { useObject } from '@tuturuuu/ai/object/core';
import { getWorkspaceCalendarDefaultSource } from '@tuturuuu/internal-api';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Dialog } from '@tuturuuu/ui/dialog';
import { newCalendarCreationRequestId } from '@tuturuuu/ui/hooks/calendar-creation-request';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { notifySave } from '@tuturuuu/ui/save-notification';
import { Tabs, TabsContent } from '@tuturuuu/ui/tabs';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CalendarEventCreationDraft } from '../../../../hooks/calendar-event-create-payload';
import { EventAiEntry } from './event-dialog/event-ai-entry';
import {
  type EventAiFormValues,
  useEventAiForm,
} from './event-dialog/event-ai-form';
import { EventAiPreview } from './event-dialog/event-ai-preview';
import {
  EventDialogContent,
  EventDialogHeader,
} from './event-dialog/event-dialog-frame';
import { EventQuickEntry } from './event-dialog/event-quick-entry';
import { EventWhenSection } from './event-dialog/event-when-section';
import { useEventDateHandlers } from './event-dialog/use-event-date-handlers';
import { useEventPromptCapture } from './event-dialog/use-event-prompt-capture';
import { eventModalDraft, eventModalSavePayload } from './event-save-payload';
import {
  eventSourceChanged,
  selectedEventSource,
  sourceInputFromOption,
} from './event-source-selection';
import {
  prepareCalendarEventDrafts,
  saveCalendarEventDrafts,
} from './save-calendar-event-drafts';
import { useCalendarSettings } from './settings/settings-context';
import { useCalendarDraftSave } from './use-calendar-draft-save';
import { useEventDraftSession } from './use-event-draft-session';

export function LegacyEventModal() {
  const toast = notifySave;
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

  const [event, setEvent] = useState<CalendarEventCreationDraft>({
    title: '',
    description: '',
    start_at: new Date().toISOString(),
    end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Default to 1 hour
    color: 'BLUE',
    location: '',
    locked: false,
  });
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const wsId = activeEvent?.ws_id || event.ws_id;
  const { data: sourceData } = useQuery({
    queryKey: ['calendar-default-source', wsId],
    enabled: !!wsId,
    queryFn: () => getWorkspaceCalendarDefaultSource(wsId as string),
    staleTime: 30_000,
  });
  const sourceOptions = useMemo(
    () => sourceData?.options ?? [],
    [sourceData?.options]
  );
  const selectedSourceOption = selectedEventSource(
    sourceOptions,
    event,
    selectedSourceId,
    sourceData?.defaultSource
  );

  // State for AI event generation
  const [generatedEvents, setGeneratedEvents] =
    useState<Partial<CalendarEvent>[]>();
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [userTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  const generatedEvent = generatedEvents?.[currentEventIndex];

  // Determine if we're editing an existing event
  const isEditing = !!(activeEvent?.id && activeEvent.id !== 'new');

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

  const aiForm = useEventAiForm(userTimezone);
  const capture = useEventPromptCapture((text) =>
    aiForm.setValue('prompt', text)
  );

  const { object, submit, error, isLoading } = useObject({
    api: '/api/v1/calendar/events/generate',
    schema: calendarEventsSchema,
  });

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

  const receiveGeneratedEvents = useEffectEvent(() => {
    const processedEvents = (object?.events || []) as Partial<CalendarEvent>[];
    setGeneratedEvents(prepareCalendarEventDrafts(processedEvents));
    setCurrentEventIndex(0);
    const firstEvent = processedEvents[0];
    if (
      firstEvent?.start_at &&
      firstEvent.end_at &&
      aiForm.getValues().smart_scheduling
    ) {
      checkForOverlaps(firstEvent);
    }
    setActiveTab('preview');
  });
  useEffect(() => {
    if (object?.events && !isLoading) receiveGeneratedEvents();
  }, [object, isLoading]);

  // Initialize once per dialog session; live calendar refreshes must not erase edits.
  useEventDraftSession({
    isOpen: isModalOpen,
    eventId: activeEvent?.id,
    workspaceId: activeEvent?.ws_id,
    initialize: () => {
      if (activeEvent) {
        const cleanEventData = eventModalDraft(activeEvent);

        setEvent(cleanEventData);
        setSelectedSourceId(
          selectedEventSource(
            sourceOptions,
            cleanEventData,
            null,
            sourceData?.defaultSource
          )?.id ?? null
        );

        if (activeEvent.id !== 'new') {
          setIsAllDay(isAllDayEvent(cleanEventData as CalendarEvent));
        } else {
          setIsAllDay(false);
        }

        // Check for overlapping events
        checkForOverlaps(cleanEventData);

        setActiveTab(isEditing ? 'manual' : defaultNewEventTab);
      } else {
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

        const newEvent = {
          requestId: newCalendarCreationRequestId(),
          title: '',
          description: '',
          start_at: now.toISOString(),
          end_at: oneHourLater.toISOString(),
          color: 'BLUE' as SupportedColor,
          location: '',
          locked: false,
          ws_id: '',
        };

        setEvent(newEvent);
        setSelectedSourceId(sourceData?.defaultSource?.id ?? null);
        setIsAllDay(false);

        aiForm.reset();
        setGeneratedEvents([]);
      }

      setDateError(null);
    },
  });

  const draftSave = useCalendarDraftSave({
    draft: event,
    original: activeEvent,
    buildPayload: () =>
      eventModalSavePayload(
        event,
        activeEvent,
        sourceInputFromOption(selectedSourceOption),
        eventSourceChanged(sourceOptions, activeEvent ?? {}, selectedSourceId)
      ),
    addEvent,
    updateEvent,
    closeModal,
    setIsSaving,
    isSaving,
    source: selectedSourceOption,
    wsId,
    onError: () =>
      toast({
        title: 'Error',
        description: 'Failed to save or sync event. Please try again.',
        variant: 'destructive',
      }),
  });
  const handleManualSave = async () => {
    // A pending AI generation would switch to its preview mid-save.
    if (isSaving || isDeleting || isLoading) return;
    if (!event.start_at || !event.end_at) return;
    if (new Date(event.end_at) <= new Date(event.start_at)) {
      setDateError('End date must be after start date');
      return;
    }
    setDateError(null);
    await draftSave.save();
  };

  // Handle AI event generation
  const handleGenerateEvent = async (values: EventAiFormValues) => {
    if (isLoading) return;
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
    if (isSaving || !generatedEvents?.length) return;

    setIsSaving(true);
    try {
      const eventsToSave = generatedEvents;
      const { savedEvents, failedEvents } = await saveCalendarEventDrafts(
        eventsToSave ?? [],
        addEvent,
        sourceInputFromOption(selectedSourceOption)
      );
      setGeneratedEvents(failedEvents);
      setCurrentEventIndex(0);

      // Show success notification
      if (savedEvents.length > 0) {
        toast({
          title: 'Success',
          description: `${savedEvents.length}/${eventsToSave?.length || 0} event${savedEvents.length > 1 ? 's' : ''} saved`,
        });
        if (failedEvents.length === 0) closeModal();
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
    if (capture.isRecording) {
      capture.stopRecording();
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

  const { handleStartDateChange, handleEndDateChange, handleAllDayChange } =
    useEventDateHandlers({
      tz,
      isAllDay,
      setIsAllDay,
      setEvent,
      setDateError,
    });

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

  const toggleLock = () => {
    const locked = !event.locked;
    if (isEditing) {
      handleLockToggle(locked);
    } else {
      setEvent((previous) => ({ ...previous, locked }));
    }
  };

  const transferGeneratedEvent = () => {
    if (!generatedEvent) return;
    setEvent({ ...generatedEvent, id: undefined });
    setActiveTab('manual');
  };

  const submitActiveTab = () => {
    if (isSaving || isDeleting) return;
    if (activeTab === 'manual') void handleManualSave();
    else if (activeTab === 'ai')
      void aiForm.handleSubmit(handleGenerateEvent)();
    else void handleAISave();
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
      <EventDialogContent onSubmitShortcut={submitActiveTab}>
        <Tabs
          value={activeTab === 'preview' ? 'ai' : activeTab}
          onValueChange={(value) => setActiveTab(value as 'manual' | 'ai')}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <EventDialogHeader
            event={event}
            isEditing={isEditing}
            showModeTabs={!isEditing}
          />
          <TabsContent
            value="manual"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <EventQuickEntry
              event={event}
              setEvent={setEvent}
              isEditing={isEditing}
              workspaceId={wsId}
              timeZone={tz}
              when={
                <EventWhenSection
                  startAt={event.start_at}
                  endAt={event.end_at}
                  isAllDay={isAllDay}
                  timeZone={tz}
                  onStartChange={handleStartDateChange}
                  onEndChange={handleEndDateChange}
                  onAllDayChange={handleAllDayChange}
                  startPickerRef={startPickerRef}
                  endPickerRef={endPickerRef}
                />
              }
              sourceOptions={sourceOptions}
              selectedSource={selectedSourceOption}
              onSourceChange={(sourceId) => {
                setSelectedSourceId(sourceId);
                setEvent((previous) => ({
                  ...previous,
                  providerColor: undefined,
                }));
              }}
              isSaving={isSaving}
              isDeleting={isDeleting}
              dateError={dateError}
              overlappingEvents={overlappingEvents}
              showOverlapWarning={showOverlapWarning}
              recoveryNotice={draftSave.recoveryNotice}
              onSave={handleManualSave}
              onCancel={closeModal}
              onDelete={handleDelete}
              onToggleLock={toggleLock}
            />
          </TabsContent>
          <TabsContent value="ai" className="mt-0 flex min-h-0 flex-1 flex-col">
            {activeTab === 'preview' ? (
              <EventAiPreview
                events={generatedEvents ?? []}
                index={currentEventIndex}
                timeFormat={settings?.appearance?.timeFormat}
                suggestions={aiSuggestions}
                overlappingEvents={overlappingEvents}
                showOverlapWarning={showOverlapWarning}
                isSaving={isSaving}
                onPrevious={goToPreviousEvent}
                onNext={goToNextEvent}
                onBack={() => setActiveTab('ai')}
                onEditDetails={transferGeneratedEvent}
                onSave={handleAISave}
              />
            ) : (
              <EventAiEntry
                form={aiForm}
                onGenerate={handleGenerateEvent}
                isGenerating={isLoading}
                error={error}
                isRecording={capture.isRecording}
                isProcessingAudio={capture.isProcessingAudio}
                isProcessingImage={capture.isProcessingImage}
                onStartRecording={capture.startRecording}
                onStopRecording={capture.stopRecording}
                onPickImage={capture.pickImage}
                onImageSelected={capture.handleImageSelected}
                fileInputRef={capture.fileInputRef}
                onCancel={closeModal}
              />
            )}
          </TabsContent>
        </Tabs>
      </EventDialogContent>
    </Dialog>
  );
}
