'use client';

import {
  BookOpen,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Edit,
  Home,
  Loader2,
  MapPin,
  Plus,
  Trash2,
} from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import timezone from 'dayjs/plugin/timezone';
import { useCallback, useEffect, useState } from 'react';

dayjs.extend(timezone);
dayjs.extend(isBetween);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

// Types
interface EventSpan {
  event: CalendarEvent;
  startIndex: number;
  endIndex: number;
  span: number;
  isCutOffStart: boolean;
  isCutOffEnd: boolean;
  actualStartDate: dayjs.Dayjs;
  actualEndDate: dayjs.Dayjs;
  row: number;
  isMerged?: boolean;
  mergedEventIds?: string[];
}

type LocationType = 'home' | 'office' | 'school' | 'custom' | null;

// Helper to determine location type
export const getLocationType = (title: string): LocationType => {
  const normalizedTitle = title.toLowerCase().trim();
  if (normalizedTitle === 'home') return 'home';
  if (normalizedTitle === 'office' || normalizedTitle === 'work')
    return 'office';
  if (normalizedTitle === 'school') return 'school';
  if (title.startsWith('📍') || title.startsWith('Location: ')) return 'custom';
  return null;
};

// Location colors using dynamic theme tokens
const locationStyles = {
  home: {
    bg: 'bg-dynamic-green/20 dark:bg-dynamic-green/30',
    text: 'text-dynamic-green',
    hover: 'hover:bg-dynamic-green/30 dark:hover:bg-dynamic-green/40',
    border: 'border-dynamic-green/50',
  },
  office: {
    bg: 'bg-dynamic-blue/20 dark:bg-dynamic-blue/30',
    text: 'text-dynamic-blue',
    hover: 'hover:bg-dynamic-blue/30 dark:hover:bg-dynamic-blue/40',
    border: 'border-dynamic-blue/50',
  },
  school: {
    bg: 'bg-dynamic-orange/20 dark:bg-dynamic-orange/30',
    text: 'text-dynamic-orange',
    hover: 'hover:bg-dynamic-orange/30 dark:hover:bg-dynamic-orange/40',
    border: 'border-dynamic-orange/50',
  },
  custom: {
    bg: 'bg-dynamic-purple/20 dark:bg-dynamic-purple/30',
    text: 'text-dynamic-purple',
    hover: 'hover:bg-dynamic-purple/30 dark:hover:bg-dynamic-purple/40',
    border: 'border-dynamic-purple/50',
  },
};

interface LocationTimelineProps {
  visibleDates: Date[];
  locationSpans: EventSpan[];
  tz: string | undefined;
  addEvent: (
    event: Omit<CalendarEvent, 'id'>
  ) => Promise<CalendarEvent | undefined>;
  updateEvent?: (
    eventId: string,
    event: Partial<CalendarEvent>
  ) => Promise<CalendarEvent | undefined>;
  openModal: (eventId?: string, type?: 'all-day' | 'event') => void;
  deleteEvent?: (eventId: string) => Promise<void>;
}

// Location Pill Component - displays existing location events
const LocationPill = ({
  eventSpan,
  visibleDates,
  openModal,
  deleteEvent,
  addEvent,
  updateEvent,
  tz,
}: {
  eventSpan: EventSpan;
  visibleDates: Date[];
  openModal: (eventId?: string, type?: 'all-day' | 'event') => void;
  deleteEvent?: (eventId: string) => Promise<void>;
  addEvent: (
    event: Omit<CalendarEvent, 'id'>
  ) => Promise<CalendarEvent | undefined>;
  updateEvent?: (
    eventId: string,
    event: Partial<CalendarEvent>
  ) => Promise<CalendarEvent | undefined>;
  tz?: string | undefined;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showTimeframeSelect, setShowTimeframeSelect] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customLocationInput, setCustomLocationInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragEdge, setDragEdge] = useState<'start' | 'end' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [tempStartIndex, setTempStartIndex] = useState(eventSpan.startIndex);
  const [tempEndIndex, setTempEndIndex] = useState(eventSpan.endIndex);

  // Pending action state to carry over after timeframe selection
  const [pendingAction, setPendingAction] = useState<{
    type: 'home' | 'office' | 'school' | 'custom';
    customName?: string;
  } | null>(null);

  // Timeframe selection state
  // 'all': Default, replaces the whole merged block
  // 'range': User specified start/end date
  const [timeframeMode, setTimeframeMode] = useState<'all' | 'range'>('all');
  const [rangeStart, setRangeStart] = useState(
    dayjs(visibleDates[eventSpan.startIndex]).format('YYYY-MM-DD')
  );
  const [rangeEnd, setRangeEnd] = useState(
    dayjs(visibleDates[eventSpan.endIndex]).format('YYYY-MM-DD')
  );

  const { event, startIndex, span } = eventSpan;
  const locationType = getLocationType(event.title ?? '');
  const isHome = locationType === 'home';
  const isOffice = locationType === 'office';
  const isSchool = locationType === 'school';
  const isCustom = locationType === 'custom';
  const styles =
    locationStyles[
      isHome ? 'home' : isOffice ? 'office' : isSchool ? 'school' : 'custom'
    ];

  // Helper to get dayjs date with proper timezone
  const getDayjsDate = useCallback(
    (d: Date | string) => (tz === 'auto' ? dayjs(d) : dayjs(d).tz(tz)),
    [tz]
  );

  // Optimistic delete wrapper - update UI immediately, rollback on error
  const optimisticDelete = useCallback(
    async (eventId: string) => {
      if (!deleteEvent) return;

      try {
        await deleteEvent(eventId);
      } catch (error) {
        // On error, delete still fails - no optimistic rollback needed
        // because the delete hasn't actually happened yet
        throw error;
      }
    },
    [deleteEvent]
  );

  // Optimistic add wrapper - update UI immediately, rollback on error
  const optimisticAdd = useCallback(
    async (eventData: Omit<CalendarEvent, 'id'>) => {
      try {
        const result = await addEvent(eventData);
        return result;
      } catch (error) {
        // On error, the add fails at the server level
        throw error;
      }
    },
    [addEvent]
  );

  /**
   * Atomic delete-and-create utility: Creates new events first, only deletes
   * old events if all creations succeed. On failure, rolls back by deleting
   * any newly created events.
   */
  const atomicDeleteAndCreate = useCallback(
    async ({
      eventsToDelete,
      eventsToCreate,
    }: {
      eventsToDelete: string[];
      eventsToCreate: Omit<CalendarEvent, 'id'>[];
    }): Promise<{ success: boolean; createdIds: string[] }> => {
      if (!deleteEvent) {
        throw new Error('deleteEvent function not available');
      }

      const createdIds: string[] = [];

      try {
        // Step 1: Create all new events first
        for (const eventData of eventsToCreate) {
          const result = await addEvent(eventData);
          if (result?.id) {
            createdIds.push(result.id);
          }
        }

        // Step 2: Delete old events only after all creations succeed
        await Promise.all(eventsToDelete.map((id) => deleteEvent(id)));

        return { success: true, createdIds };
      } catch (error) {
        // Rollback: delete any newly created events (ignore errors during rollback)
        await Promise.all(
          createdIds.map((id) => deleteEvent(id).catch(() => {}))
        );
        throw error;
      }
    },
    [addEvent, deleteEvent]
  );

  // Determine if this is a merged set of single-day events or a single multi-day event
  const isMergedDailyEvents = Boolean(
    eventSpan.isMerged && eventSpan.mergedEventIds
  );
  const isSingleDayEvent = span === 1;
  const isMultiDayEvent = !isMergedDailyEvents && span > 1;

  // Identify all events covered by this span
  const getCoveredEvents = useCallback((): {
    id: string;
    date: dayjs.Dayjs;
  }[] => {
    // If this is a merged set of single-day events
    if (isMergedDailyEvents && eventSpan.mergedEventIds) {
      return eventSpan.mergedEventIds.map((id, idx) => {
        const dayIndex = startIndex + idx;
        return { id, date: getDayjsDate(visibleDates[dayIndex] ?? new Date()) };
      });
    }

    // Single event (either single-day or multi-day)
    return [
      {
        id: event.id,
        date: getDayjsDate(visibleDates[startIndex] ?? new Date()),
      },
    ];
  }, [
    isMergedDailyEvents,
    eventSpan.mergedEventIds,
    event.id,
    startIndex,
    visibleDates,
    getDayjsDate,
  ]);

  const executeSwitch = async () => {
    if (!deleteEvent || !pendingAction) return;
    setIsLoading(true);

    try {
      const newType = pendingAction.type;
      const customName = pendingAction.customName;

      const newTitle =
        newType === 'home'
          ? 'Home'
          : newType === 'office'
            ? 'Office'
            : newType === 'school'
              ? 'School'
              : `Location: ${customName}`;

      const newColor =
        newType === 'home'
          ? 'GREEN'
          : newType === 'office'
            ? 'BLUE'
            : newType === 'school'
              ? 'ORANGE'
              : 'PURPLE';

      const coveredEvents = getCoveredEvents();

      // Determine the range of dates to affect
      let affectedStartDate: dayjs.Dayjs;
      let affectedEndDate: dayjs.Dayjs;

      if (timeframeMode === 'all') {
        // Affect entire span
        affectedStartDate = getDayjsDate(
          visibleDates[startIndex] ?? new Date()
        );
        affectedEndDate = getDayjsDate(
          visibleDates[startIndex + span - 1] ?? new Date()
        );
      } else {
        // Custom range
        affectedStartDate = dayjs(rangeStart);
        affectedEndDate = dayjs(rangeEnd);
      }

      if (isMergedDailyEvents) {
        // Handle merged single-day events
        // Delete events within the affected range and create new single-day events
        const eventsToDelete: string[] = [];
        const datesToCreate: dayjs.Dayjs[] = [];

        coveredEvents.forEach((e) => {
          if (
            e.date.isBetween(affectedStartDate, affectedEndDate, 'day', '[]')
          ) {
            eventsToDelete.push(e.id);
            datesToCreate.push(e.date);
          }
        });

        // Delete affected events with optimistic updates
        await Promise.all(eventsToDelete.map((id) => optimisticDelete(id)));

        // Create new single-day events for consistency with the original pattern
        await Promise.all(
          datesToCreate.map((date) =>
            optimisticAdd({
              title: newTitle,
              start_at: date.startOf('day').toISOString(),
              end_at: date.add(1, 'day').startOf('day').toISOString(),
              color: newColor,
            })
          )
        );
      } else if (isMultiDayEvent) {
        // Handle single multi-day event
        // We need to be more careful here - we might need to split the event
        const eventStart = getDayjsDate(event.start_at);
        const eventEnd = getDayjsDate(event.end_at).subtract(1, 'day'); // End is exclusive

        const isFullCoverage =
          affectedStartDate.isSameOrBefore(eventStart, 'day') &&
          affectedEndDate.isSameOrAfter(eventEnd, 'day');

        if (isFullCoverage || timeframeMode === 'all') {
          // Replace the entire event
          await optimisticDelete(event.id);
          await optimisticAdd({
            title: newTitle,
            start_at: eventStart.startOf('day').toISOString(),
            end_at: eventEnd.add(1, 'day').startOf('day').toISOString(),
            color: newColor,
          });
        } else {
          // Partial coverage - this is complex, so we create individual day events
          // Delete the original event
          await optimisticDelete(event.id);

          // Create events for the unchanged portion (before affected range)
          if (affectedStartDate.isAfter(eventStart, 'day')) {
            await optimisticAdd({
              title: event.title ?? '',
              start_at: eventStart.startOf('day').toISOString(),
              end_at: affectedStartDate.startOf('day').toISOString(),
              color: event.color ?? 'BLUE',
            });
          }

          // Create events for the affected range (new location)
          await optimisticAdd({
            title: newTitle,
            start_at: affectedStartDate.startOf('day').toISOString(),
            end_at: affectedEndDate.add(1, 'day').startOf('day').toISOString(),
            color: newColor,
          });

          // Create events for the unchanged portion (after affected range)
          if (affectedEndDate.isBefore(eventEnd, 'day')) {
            await optimisticAdd({
              title: event.title ?? '',
              start_at: affectedEndDate
                .add(1, 'day')
                .startOf('day')
                .toISOString(),
              end_at: eventEnd.add(1, 'day').startOf('day').toISOString(),
              color: event.color ?? 'BLUE',
            });
          }
        }
      } else {
        // Single day event - simple replace
        await optimisticDelete(event.id);
        await optimisticAdd({
          title: newTitle,
          start_at: getDayjsDate(visibleDates[startIndex] ?? new Date())
            .startOf('day')
            .toISOString(),
          end_at: getDayjsDate(visibleDates[startIndex] ?? new Date())
            .add(1, 'day')
            .startOf('day')
            .toISOString(),
          color: newColor,
        });
      }

      setIsOpen(false);
      setShowTimeframeSelect(false);
      setShowCustomInput(false);
      setPendingAction(null);
    } catch (error) {
      console.error('Failed to switch location:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Direct switch for single-day events with optimistic update
  const executeSwitchDirect = async (
    type: 'home' | 'office' | 'school' | 'custom',
    customName?: string
  ) => {
    if (!deleteEvent) return;
    setIsLoading(true);

    try {
      const newTitle =
        type === 'home'
          ? 'Home'
          : type === 'office'
            ? 'Office'
            : type === 'school'
              ? 'School'
              : `Location: ${customName}`;

      const newColor =
        type === 'home'
          ? 'GREEN'
          : type === 'office'
            ? 'BLUE'
            : type === 'school'
              ? 'ORANGE'
              : 'PURPLE';

      await optimisticDelete(event.id);
      await optimisticAdd({
        title: newTitle,
        start_at: getDayjsDate(visibleDates[startIndex] ?? new Date())
          .startOf('day')
          .toISOString(),
        end_at: getDayjsDate(visibleDates[startIndex] ?? new Date())
          .add(1, 'day')
          .startOf('day')
          .toISOString(),
        color: newColor,
      });

      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch location:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitiateSwitch = (
    type: 'home' | 'office' | 'school' | 'custom',
    customName?: string
  ) => {
    // For single-day events, execute directly
    if (isSingleDayEvent) {
      executeSwitchDirect(type, customName);
    } else {
      // For multi-day events, show the timeframe selector
      setPendingAction({ type, customName });
      setShowTimeframeSelect(true);
    }
  };

  const handleDelete = async () => {
    if (!deleteEvent) return;
    setIsLoading(true);

    try {
      if (isMergedDailyEvents && eventSpan.mergedEventIds) {
        // Delete all merged events with optimistic updates
        await Promise.all(
          eventSpan.mergedEventIds.map((id) => optimisticDelete(id))
        );
      } else {
        // Delete single event
        await optimisticDelete(event.id);
      }
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to delete location:', error);
    } finally {
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleRemoveClick = () => {
    if (showDeleteConfirm) {
      void handleDelete();
      return;
    }
    setShowDeleteConfirm(true);
  };

  // Handle drag to resize
  const handleDragStart = (edge: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    setDragEdge(edge);
    setDragStartX(e.clientX);
    setTempStartIndex(eventSpan.startIndex);
    setTempEndIndex(eventSpan.endIndex);
  };

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragEdge) return;

      const containerWidth =
        document.querySelector('[data-location-timeline]')?.clientWidth || 1000;
      const dayWidth = containerWidth / visibleDates.length;
      const deltaX = e.clientX - dragStartX;
      const daysDelta = Math.round(deltaX / dayWidth);

      if (dragEdge === 'start') {
        const newStart = Math.max(
          0,
          Math.min(tempEndIndex, eventSpan.startIndex + daysDelta)
        );
        setTempStartIndex(newStart);
      } else {
        const newEnd = Math.min(
          visibleDates.length - 1,
          Math.max(tempStartIndex, eventSpan.endIndex + daysDelta)
        );
        setTempEndIndex(newEnd);
      }
    },
    [
      isDragging,
      dragEdge,
      dragStartX,
      visibleDates.length,
      eventSpan.startIndex,
      eventSpan.endIndex,
      tempStartIndex,
      tempEndIndex,
    ]
  );

  const handleDragEnd = useCallback(async () => {
    if (!isDragging || !deleteEvent) {
      setIsDragging(false);
      setDragEdge(null);
      return;
    }

    const finalStartIndex = tempStartIndex;
    const finalEndIndex = tempEndIndex;

    setIsDragging(false);
    setDragEdge(null);

    // Only update if changed
    if (
      finalStartIndex === eventSpan.startIndex &&
      finalEndIndex === eventSpan.endIndex
    ) {
      return;
    }

    setIsLoading(true);

    try {
      // Get event properties
      const eventTitle = event.title ?? 'Home';
      const eventColor = event.color ?? 'GREEN';

      // Determine which events to delete
      const eventsToDelete =
        isMergedDailyEvents && eventSpan.mergedEventIds
          ? eventSpan.mergedEventIds
          : [event.id];

      // Build list of events to create for the new range
      const eventsToCreate: Omit<CalendarEvent, 'id'>[] = [];
      for (let i = finalStartIndex; i <= finalEndIndex; i++) {
        const dayDate = getDayjsDate(visibleDates[i] ?? new Date());
        eventsToCreate.push({
          title: eventTitle,
          start_at: dayDate.startOf('day').toISOString(),
          end_at: dayDate.add(1, 'day').startOf('day').toISOString(),
          color: eventColor,
        });
      }

      // Use atomic utility: create first, delete only on success, rollback on failure
      await atomicDeleteAndCreate({ eventsToDelete, eventsToCreate });

      // SUCCESS: Don't set isLoading to false here.
      // The parent will re-render with new locationSpans,
      // causing this component to unmount and new one to mount.
      // Keeping isLoading=true maintains visual stability until unmount.
    } catch (error) {
      console.error('Failed to resize location:', error);
      // ERROR: Reset to original state and clear loading
      setTempStartIndex(eventSpan.startIndex);
      setTempEndIndex(eventSpan.endIndex);
      setIsLoading(false);
    }
  }, [
    isDragging,
    deleteEvent,
    atomicDeleteAndCreate,
    tempStartIndex,
    tempEndIndex,
    eventSpan.startIndex,
    eventSpan.endIndex,
    eventSpan.mergedEventIds,
    isMergedDailyEvents,
    event.id,
    event.title,
    event.color,
    visibleDates,
    getDayjsDate,
  ]);

  // Attach global mouse listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Compute display indices (use temp during drag OR while loading)
  const displayStartIndex =
    isDragging || isLoading ? tempStartIndex : startIndex;
  const displayEndIndex =
    isDragging || isLoading ? tempEndIndex : startIndex + span - 1;
  const displaySpan = displayEndIndex - displayStartIndex + 1;

  // Format display text for custom locations
  const getDisplayText = (title: string) => {
    return title.replace(/^Location: |^📍 /g, '');
  };

  // Reset all states when popover closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setShowCustomInput(false);
      setShowTimeframeSelect(false);
      setShowDeleteConfirm(false);
      setPendingAction(null);
      setTimeframeMode('all');
      setRangeStart(
        dayjs(visibleDates[eventSpan.startIndex]).format('YYYY-MM-DD')
      );
      setRangeEnd(dayjs(visibleDates[eventSpan.endIndex]).format('YYYY-MM-DD'));
    }
  };

  // Get the label showing the span info
  const getSpanLabel = () => {
    if (isSingleDayEvent) {
      return getDayjsDate(visibleDates[startIndex] ?? new Date()).format(
        'MMM D'
      );
    }
    const start = getDayjsDate(visibleDates[startIndex] ?? new Date());
    const end = getDayjsDate(visibleDates[startIndex + span - 1] ?? new Date());
    return `${start.format('MMM D')} - ${end.format('MMM D')}`;
  };

  // Helper to render Delete Confirmation UI
  const renderDeleteConfirm = () => (
    <div className="flex flex-col gap-3 p-2">
      <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs">
        <button
          type="button"
          className="rounded p-0.5 hover:bg-muted"
          onClick={() => setShowDeleteConfirm(false)}
          disabled={isLoading}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span>Confirm Delete</span>
      </div>

      <p className="text-muted-foreground text-xs">
        {isMergedDailyEvents
          ? `Delete ${eventSpan.mergedEventIds?.length ?? span} location events?`
          : isMultiDayEvent
            ? `Delete this ${span}-day location event?`
            : 'Delete this location?'}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded border px-2 py-1.5 font-medium text-xs hover:bg-muted"
          onClick={() => setShowDeleteConfirm(false)}
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1 rounded bg-dynamic-red px-2 py-1.5 font-medium text-white text-xs hover:bg-dynamic-red/90"
          onClick={handleDelete}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
        </button>
      </div>
    </div>
  );

  // Helper to render Timeframe Selection UI
  const renderTimeframeSelector = () => (
    <div className="flex flex-col gap-3 p-2">
      <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs">
        <button
          type="button"
          className="rounded p-0.5 hover:bg-muted"
          onClick={() => setShowTimeframeSelect(false)}
          disabled={isLoading}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span>Select Timeframe</span>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs">
        {pendingAction?.type === 'home' ? (
          <Home className="h-3.5 w-3.5 text-dynamic-green" />
        ) : pendingAction?.type === 'office' ? (
          <Building2 className="h-3.5 w-3.5 text-dynamic-blue" />
        ) : pendingAction?.type === 'school' ? (
          <BookOpen className="h-3.5 w-3.5 text-dynamic-orange" />
        ) : (
          <MapPin className="h-3.5 w-3.5 text-dynamic-purple" />
        )}
        <span className="font-medium">
          Switch to{' '}
          {pendingAction?.type === 'custom'
            ? pendingAction?.customName
            : pendingAction?.type === 'home'
              ? 'Home'
              : pendingAction?.type === 'office'
                ? 'Office'
                : 'School'}
        </span>
      </div>

      <div className="flex flex-col gap-2 text-xs">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors hover:bg-muted/30">
          <input
            type="radio"
            name="timeframe"
            className="accent-primary"
            checked={timeframeMode === 'all'}
            onChange={() => setTimeframeMode('all')}
            disabled={isLoading}
          />
          <div className="flex flex-col">
            <span className="font-medium">Entire duration</span>
            <span className="text-[10px] text-muted-foreground">
              {span} {span === 1 ? 'day' : 'days'} ({getSpanLabel()})
            </span>
          </div>
        </label>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors hover:bg-muted/30">
          <input
            type="radio"
            name="timeframe"
            className="accent-primary"
            checked={timeframeMode === 'range'}
            onChange={() => setTimeframeMode('range')}
            disabled={isLoading}
          />
          <span className="font-medium">Custom range</span>
        </label>

        {timeframeMode === 'range' && (
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/10 p-2">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-[10px] text-muted-foreground">
                Start
              </span>
              <input
                type="date"
                className="w-full rounded border bg-background px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                min={dayjs(visibleDates[eventSpan.startIndex]).format(
                  'YYYY-MM-DD'
                )}
                max={rangeEnd}
                disabled={isLoading}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-[10px] text-muted-foreground">
                End
              </span>
              <input
                type="date"
                className="w-full rounded border bg-background px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                min={rangeStart}
                max={dayjs(visibleDates[eventSpan.endIndex]).format(
                  'YYYY-MM-DD'
                )}
                disabled={isLoading}
              />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-xs transition-colors hover:bg-primary/90 disabled:opacity-50"
        onClick={executeSwitch}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Switching...</span>
          </>
        ) : (
          'Confirm'
        )}
      </button>
    </div>
  );

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'group absolute flex h-4 items-center justify-center gap-1 rounded-full px-2 font-medium text-[10px] shadow-sm transition-all',
            styles.bg,
            styles.text,
            styles.hover,
            'hover:shadow-md',
            isDragging ? 'cursor-grabbing' : 'cursor-pointer'
          )}
          style={{
            left: `calc(${(displayStartIndex * 100) / visibleDates.length}% + 4px)`,
            width: `calc(${(displaySpan * 100) / visibleDates.length}% - 8px)`,
            opacity: isDragging ? 0.7 : 1,
          }}
          title={`${event.title}${displaySpan > 1 ? ` (${displaySpan} days)` : ''}`}
        >
          {/* Resize handle - start */}
          {updateEvent && (
            <div
              className="absolute top-0 bottom-0 left-0 w-2 cursor-col-resize opacity-0 hover:opacity-100 group-hover:opacity-50"
              onMouseDown={(e) => handleDragStart('start', e)}
              style={{
                background:
                  'linear-gradient(to right, rgba(0,0,0,0.3), transparent)',
              }}
            />
          )}
          {isHome ? (
            <Home className="h-3 w-3 shrink-0" />
          ) : isOffice ? (
            <Building2 className="h-3 w-3 shrink-0" />
          ) : locationType === 'school' ? (
            <BookOpen className="h-3 w-3 shrink-0" />
          ) : (
            <MapPin className="h-3 w-3 shrink-0" />
          )}
          <span className="hidden truncate sm:inline">
            {isCustom ? getDisplayText(event.title ?? '') : event.title}
          </span>
          {/* Resize handle - end */}
          {updateEvent && (
            <div
              className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize opacity-0 hover:opacity-100 group-hover:opacity-50"
              onMouseDown={(e) => handleDragStart('end', e)}
              style={{
                background:
                  'linear-gradient(to left, rgba(0,0,0,0.3), transparent)',
              }}
            />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="center" side="bottom">
        {showDeleteConfirm ? (
          renderDeleteConfirm()
        ) : showTimeframeSelect ? (
          renderTimeframeSelector()
        ) : showCustomInput ? (
          <div className="flex flex-col gap-3 p-2">
            <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs">
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => setShowCustomInput(false)}
                disabled={isLoading}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span>Set Custom Location</span>
            </div>
            <input
              type="text"
              placeholder="e.g. Coffee Shop, Client Office"
              value={customLocationInput}
              onChange={(e) => setCustomLocationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customLocationInput.trim()) {
                  handleInitiateSwitch('custom', customLocationInput.trim());
                }
                if (e.key === 'Escape') {
                  setShowCustomInput(false);
                }
              }}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/50"
              ref={(input) => input?.focus()}
              disabled={isLoading}
            />
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-xs transition-colors hover:bg-primary/90 disabled:opacity-50"
              onClick={() => {
                if (customLocationInput.trim()) {
                  handleInitiateSwitch('custom', customLocationInput.trim());
                }
              }}
              disabled={!customLocationInput.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Setting...</span>
                </>
              ) : isSingleDayEvent ? (
                'Set Location'
              ) : (
                'Next'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header with current location info */}
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full',
                  styles.bg
                )}
              >
                {isHome ? (
                  <Home className={cn('h-4 w-4', styles.text)} />
                ) : isOffice ? (
                  <Building2 className={cn('h-4 w-4', styles.text)} />
                ) : isSchool ? (
                  <BookOpen className={cn('h-4 w-4', styles.text)} />
                ) : (
                  <MapPin className={cn('h-4 w-4', styles.text)} />
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-sm">
                  {isCustom ? getDisplayText(event.title ?? '') : event.title}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {getSpanLabel()}
                  {isMergedDailyEvents && eventSpan.mergedEventIds && (
                    <> · {eventSpan.mergedEventIds.length} events</>
                  )}
                </span>
              </div>
            </div>

            {/* Switch options */}
            <div className="p-1">
              <div className="px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                Switch to
              </div>
              {!isHome && (
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors',
                    locationStyles.home.hover
                  )}
                  onClick={() => handleInitiateSwitch('home')}
                  disabled={isLoading}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-green/20">
                    <Home className="h-3.5 w-3.5 text-dynamic-green" />
                  </div>
                  <span className="font-medium">Home</span>
                </button>
              )}
              {!isOffice && (
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors',
                    locationStyles.office.hover
                  )}
                  onClick={() => handleInitiateSwitch('office')}
                  disabled={isLoading}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-blue/20">
                    <Building2 className="h-3.5 w-3.5 text-dynamic-blue" />
                  </div>
                  <span className="font-medium">Office</span>
                </button>
              )}
              {!isSchool && (
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors',
                    locationStyles.school.hover
                  )}
                  onClick={() => handleInitiateSwitch('school')}
                  disabled={isLoading}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-orange/20">
                    <BookOpen className="h-3.5 w-3.5 text-dynamic-orange" />
                  </div>
                  <span className="font-medium">School</span>
                </button>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted"
                onClick={() => {
                  setShowCustomInput(true);
                  setCustomLocationInput(
                    isCustom ? getDisplayText(event.title ?? '') : ''
                  );
                }}
                disabled={isLoading}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-purple/20">
                  <MapPin className="h-3.5 w-3.5 text-dynamic-purple" />
                </div>
                <span className="font-medium">
                  {isCustom ? 'Edit Custom...' : 'Custom Location...'}
                </span>
              </button>
            </div>

            <div className="h-px bg-border" />

            {/* Actions */}
            <div className="p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted"
                onClick={() => {
                  openModal(event.id, 'all-day');
                  setIsOpen(false);
                }}
                disabled={isLoading}
              >
                <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Edit Event Details...</span>
              </button>

              {deleteEvent && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-dynamic-red text-xs transition-colors hover:bg-dynamic-red/10"
                  onClick={handleRemoveClick}
                  disabled={isLoading}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>
                    {isMergedDailyEvents
                      ? `Remove All (${eventSpan.mergedEventIds?.length ?? span})`
                      : 'Remove'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

// Location Picker Component - for adding new location events
const LocationPicker = ({
  dateIndex,
  visibleDates,
  tz,
  addEvent,
  isOpen,
  onOpenChange,
}: {
  dateIndex: number;
  visibleDates: Date[];
  tz: string | undefined;
  addEvent: (
    event: Omit<CalendarEvent, 'id'>
  ) => Promise<CalendarEvent | undefined>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customLocationInput, setCustomLocationInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const getDayjsDate = (d: Date | string) =>
    tz === 'auto' ? dayjs(d) : dayjs(d).tz(tz);

  const handleAddLocation = async (
    type: 'home' | 'office' | 'school' | 'custom',
    customName?: string
  ) => {
    const selectedDate = visibleDates[dateIndex];
    if (!selectedDate) return;

    setIsLoading(true);

    try {
      const title =
        type === 'home'
          ? 'Home'
          : type === 'office'
            ? 'Office'
            : type === 'school'
              ? 'School'
              : `Location: ${customName}`;
      const color =
        type === 'home'
          ? 'GREEN'
          : type === 'office'
            ? 'BLUE'
            : type === 'school'
              ? 'ORANGE'
              : 'PURPLE';

      await addEvent({
        title,
        start_at: getDayjsDate(selectedDate).startOf('day').toISOString(),
        end_at: getDayjsDate(selectedDate)
          .add(1, 'day')
          .startOf('day')
          .toISOString(),
        color,
      });

      onOpenChange(false);
      setShowCustomInput(false);
      setCustomLocationInput('');
    } catch (error) {
      console.error('Failed to add location:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const displayDate = getDayjsDate(visibleDates[dateIndex] ?? new Date());

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setShowCustomInput(false);
          setCustomLocationInput('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <div
          className={cn(
            'flex h-4 items-center justify-center gap-1 rounded-full px-2 text-[10px] transition-all',
            isOpen
              ? 'bg-foreground/10 text-foreground'
              : 'text-muted-foreground opacity-0 hover:bg-foreground/5 group-hover:opacity-100'
          )}
        >
          <Plus className="h-3 w-3" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="center" side="bottom">
        {showCustomInput ? (
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs">
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => setShowCustomInput(false)}
                disabled={isLoading}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span>Custom Location</span>
            </div>
            <input
              type="text"
              placeholder="e.g. Coffee Shop, Client Office"
              value={customLocationInput}
              onChange={(e) => setCustomLocationInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && customLocationInput.trim()) {
                  await handleAddLocation('custom', customLocationInput.trim());
                }
                if (e.key === 'Escape') {
                  setShowCustomInput(false);
                  setCustomLocationInput('');
                }
              }}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/50"
              ref={(input) => input?.focus()}
              disabled={isLoading}
            />
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-xs transition-colors hover:bg-primary/90 disabled:opacity-50"
              onClick={async () => {
                if (customLocationInput.trim()) {
                  await handleAddLocation('custom', customLocationInput.trim());
                }
              }}
              disabled={!customLocationInput.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                'Add Location'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header */}
            <div className="border-b px-3 py-2">
              <span className="font-medium text-xs">Set Location</span>
              <p className="text-[10px] text-muted-foreground">
                {displayDate.format('ddd, MMM D')}
              </p>
            </div>

            {/* Options */}
            <div className="p-1">
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors',
                  locationStyles.home.hover
                )}
                onClick={() => handleAddLocation('home')}
                disabled={isLoading}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-green/20">
                  <Home className="h-3.5 w-3.5 text-dynamic-green" />
                </div>
                <span className="font-medium">Home</span>
              </button>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors',
                  locationStyles.office.hover
                )}
                onClick={() => handleAddLocation('office')}
                disabled={isLoading}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-blue/20">
                  <Building2 className="h-3.5 w-3.5 text-dynamic-blue" />
                </div>
                <span className="font-medium">Office</span>
              </button>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors',
                  locationStyles.school.hover
                )}
                onClick={() => handleAddLocation('school')}
                disabled={isLoading}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-orange/20">
                  <BookOpen className="h-3.5 w-3.5 text-dynamic-orange" />
                </div>
                <span className="font-medium">School</span>
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted"
                onClick={() => setShowCustomInput(true)}
                disabled={isLoading}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-purple/20">
                  <MapPin className="h-3.5 w-3.5 text-dynamic-purple" />
                </div>
                <span className="font-medium">Custom Location...</span>
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

// Main LocationTimeline Component
export const LocationTimeline = ({
  visibleDates,
  locationSpans,
  tz,
  addEvent,
  updateEvent,
  openModal,
  deleteEvent,
}: LocationTimelineProps) => {
  // Track expanded state for showing more than 2 events
  const [isExpanded, setIsExpanded] = useState(false);

  // Limit to 2 visible events unless expanded
  const visibleLocationSpans = isExpanded
    ? locationSpans
    : locationSpans.slice(0, 2);
  const hasMoreEvents = locationSpans.length > 2;

  return (
    <div
      className="absolute top-0 right-0 left-0 flex h-5 items-center"
      style={{ zIndex: 15 }}
    >
      {/* Clickable day cells for adding locations */}
      {visibleDates.map((date, dateIndex) => {
        const dateKey =
          tz === 'auto'
            ? dayjs(date).format('YYYY-MM-DD')
            : dayjs(date).tz(tz).format('YYYY-MM-DD');

        // Check if this day already has a location event
        const hasLocationEvent = locationSpans.some(
          (span) => dateIndex >= span.startIndex && dateIndex <= span.endIndex
        );

        // We use a local state wrapper for the Popover to ensure unique state per cell
        // Actually, we can just render the LocationPicker component which has local state?
        // No, LocationPicker needs `isOpen` and `onOpenChange` if we want to control it,
        // OR we can make LocationPicker handle its own state if it's Uncontrolled.
        // Let's make LocationPicker accept `defaultOpen={false}` or just manage internal state if simple.
        // But the previous implementation used `activePickerDayIndex`.
        // Let's use a wrapper component for the day cell to hold state.

        if (hasLocationEvent) return null;

        return (
          <DayCellWrapper
            key={`location-add-${dateKey}`}
            dateIndex={dateIndex}
            visibleDates={visibleDates}
            tz={tz}
            addEvent={addEvent}
          />
        );
      })}

      {/* Existing location events */}
      {visibleLocationSpans.map((eventSpan) => (
        <LocationPill
          key={`location-${eventSpan.event.id}`}
          eventSpan={eventSpan}
          visibleDates={visibleDates}
          openModal={openModal}
          deleteEvent={deleteEvent}
          addEvent={addEvent}
          updateEvent={updateEvent}
          tz={tz}
        />
      ))}

      {/* Expand/Collapse button */}
      {hasMoreEvents && (
        <button
          type="button"
          className="absolute top-0 right-2 flex h-4 items-center gap-1 rounded-full bg-foreground/10 px-2 font-medium text-[10px] text-muted-foreground transition-colors hover:bg-foreground/20 hover:text-foreground"
          onClick={() => setIsExpanded(!isExpanded)}
          title={
            isExpanded ? 'Show less' : `Show ${locationSpans.length - 2} more`
          }
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              <span className="hidden sm:inline">Less</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              <span className="hidden sm:inline">
                +{locationSpans.length - 2}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

// Helper component to manage state for each day cell
const DayCellWrapper = ({
  dateIndex,
  visibleDates,
  tz,
  addEvent,
}: {
  dateIndex: number;
  visibleDates: Date[];
  tz: string | undefined;
  addEvent: (
    event: Omit<CalendarEvent, 'id'>
  ) => Promise<CalendarEvent | undefined>;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="group absolute flex h-4 cursor-pointer items-center justify-center"
      style={{
        left: `${(dateIndex * 100) / visibleDates.length}%`,
        width: `${100 / visibleDates.length}%`,
      }}
      onClick={() => {
        // Prevent click from propagating if we just want to open the popover
        // PopoverTrigger handles the click, but the div also has onClick?
        // Actually, PopoverTrigger should be the interactive element.
        // We'll let the click bubble to PopoverTrigger inside LocationPicker
      }}
    >
      <LocationPicker
        dateIndex={dateIndex}
        visibleDates={visibleDates}
        tz={tz}
        addEvent={addEvent}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </div>
  );
};
