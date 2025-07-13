import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import timezone from 'dayjs/plugin/timezone';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import { MIN_COLUMN_WIDTH } from './config';

dayjs.extend(isBetween);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(timezone);

const MAX_EVENTS_DISPLAY = 2;

// Define types for better type safety
interface EventSpan {
  event: CalendarEvent;
  startIndex: number;
  endIndex: number;
  span: number;
  // Add indicators for cut-off events
  isCutOffStart: boolean; // Event starts before visible range
  isCutOffEnd: boolean;   // Event ends after visible range
  actualStartDate: dayjs.Dayjs; // Actual start date of the event
  actualEndDate: dayjs.Dayjs;   // Actual end date of the event
  row: number; // Add row property for proper stacking
}

interface EventLayout {
  spans: EventSpan[];
  maxVisibleEventsPerDay: number;
  eventsByDay: EventSpan[][];
}

// Enhanced drag state interface with cross-zone support
interface DragState {
  isDragging: boolean;
  draggedEvent: CalendarEvent | null;
  draggedEventSpan: EventSpan | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetDateIndex: number | null;
  originalDateIndex: number;
  // Add preview span for better visual feedback
  previewSpan: {
    startIndex: number;
    span: number;
    row: number;
  } | null;
  // Cross-zone dragging support
  dragZone: 'all-day' | 'timed' | null; // Current drag zone
  targetZone: 'all-day' | 'timed' | null; // Target drop zone
  timeSlotTarget: {
    date: Date;
    hour: number;
    minute: number;
  } | null;
}

// Enhanced metadata storage using scheduling_note field (cleaner approach)
const METADATA_MARKER = '__PRESERVED_METADATA__';

interface PreservedMetadata {
  original_scheduling_note?: string;
  preserved_timed_start?: string;
  preserved_timed_end?: string;
  was_all_day?: boolean;
}

const preserveTimestamps = (event: CalendarEvent): CalendarEvent => {
  // Store original timed timestamps in scheduling_note when converting to all-day
  const schedulingNote = event.scheduling_note || '';
  
  if (!schedulingNote.includes(METADATA_MARKER)) {
    const preservedData: PreservedMetadata = {
      original_scheduling_note: schedulingNote,
      preserved_timed_start: event.start_at,
      preserved_timed_end: event.end_at,
      was_all_day: false,
    };
    
    return {
      ...event,
      scheduling_note: `${schedulingNote}${METADATA_MARKER}${JSON.stringify(preservedData)}`,
    };
  }
  
  return event;
};

const restoreTimestamps = (event: CalendarEvent, targetDate?: Date): CalendarEvent => {
  // Restore preserved timestamps when converting back to timed
  const schedulingNote = event.scheduling_note || '';
  
  if (schedulingNote.includes(METADATA_MARKER)) {
    try {
      const [, preservedJson] = schedulingNote.split(METADATA_MARKER);
      const preservedData: PreservedMetadata = JSON.parse(preservedJson || '{}');
      
      let startAt = preservedData.preserved_timed_start;
      let endAt = preservedData.preserved_timed_end;
      
      // If we have preserved timestamps, use them
      if (startAt && endAt) {
        // If dragged to a different date, adjust the date while preserving time
        if (targetDate) {
          const originalStart = dayjs(startAt);
          const originalEnd = dayjs(endAt);
          
          // Use the target date but preserve the original time
          const targetDayjs = dayjs(targetDate);
          
          startAt = targetDayjs
            .hour(originalStart.hour())
            .minute(originalStart.minute())
            .second(originalStart.second())
            .millisecond(originalStart.millisecond())
            .toISOString();
          
          // Calculate duration to preserve event length
          const duration = originalEnd.diff(originalStart, 'millisecond');
          endAt = dayjs(startAt).add(duration, 'millisecond').toISOString();
        }
        
        return {
          ...event,
          start_at: startAt,
          end_at: endAt,
          scheduling_note: preservedData.original_scheduling_note || '',
        };
      }
    } catch (error) {
      console.error('Failed to restore timestamps:', error);
    }
  }
  
  return event;
};

const createTimedEventFromAllDay = (event: CalendarEvent, targetDate: Date, hour: number = 9, minute: number = 0): CalendarEvent => {
  // First check if we have preserved timestamps to restore
  const restoredEvent = restoreTimestamps(event, targetDate);
  
  // If timestamps were successfully restored, use them
  if (restoredEvent.start_at !== event.start_at || restoredEvent.end_at !== event.end_at) {
    return restoredEvent;
  }
  
  // No preserved timestamps - this means it was originally an all-day event
  // Use the drop location time with default 1-hour duration
  const startTime = dayjs(targetDate).hour(hour).minute(minute).second(0).millisecond(0);
  const endTime = startTime.add(1, 'hour'); // Default 1-hour duration
  
  // Check if this event already has metadata (was converted before)
  const schedulingNote = event.scheduling_note || '';
  if (schedulingNote.includes(METADATA_MARKER)) {
    // Event already has metadata, just update the timestamps
    return {
      ...event,
      start_at: startTime.toISOString(),
      end_at: endTime.toISOString(),
    };
  }
  
  // Fresh all-day event, preserve it as all-day in metadata
  const preservedData: PreservedMetadata = {
    original_scheduling_note: schedulingNote,
    preserved_timed_start: startTime.toISOString(),
    preserved_timed_end: endTime.toISOString(),
    was_all_day: true,
  };
  
  return {
    ...event,
    start_at: startTime.toISOString(),
    end_at: endTime.toISOString(),
    scheduling_note: `${schedulingNote}${METADATA_MARKER}${JSON.stringify(preservedData)}`,
  };
};

const createAllDayEventFromTimed = (event: CalendarEvent, targetDate: Date): CalendarEvent => {
  // Convert timed event to all-day event
  const startOfDay = dayjs(targetDate).startOf('day');
  const endOfDay = startOfDay.add(1, 'day');
  
  // Check if we have preserved all-day timestamps to restore
  const schedulingNote = event.scheduling_note || '';
  if (schedulingNote.includes(METADATA_MARKER)) {
    try {
      const [, preservedJson] = schedulingNote.split(METADATA_MARKER);
      const preservedData: PreservedMetadata = JSON.parse(preservedJson || '{}');
      
      // If this was originally an all-day event, restore to all-day for the target date
      if (preservedData.was_all_day) {
        return {
          ...event,
          start_at: startOfDay.toISOString(),
          end_at: endOfDay.toISOString(),
          scheduling_note: preservedData.original_scheduling_note || '',
        };
      }
    } catch (error) {
      console.error('Failed to restore all-day timestamps:', error);
    }
  }
  
  // First preserve the timed timestamps
  const preservedEvent = preserveTimestamps(event);
  
  return {
    ...preservedEvent,
    start_at: startOfDay.toISOString(),
    end_at: endOfDay.toISOString(),
  };
};

// Export for use in other components (like event modal toggle)
export { preserveTimestamps, restoreTimestamps, createAllDayEventFromTimed, METADATA_MARKER };

// 1. Extract EventContent component for shared rendering
const EventContent = ({ event }: { event: CalendarEvent }) => (
  <>
    {typeof event.google_event_id === 'string' &&
      event.google_event_id.trim() !== '' && (
        <img
          src="/media/google-calendar-icon.png"
          alt="Google Calendar"
          className="mr-1 inline-block h-[1.25em] w-[1.25em] align-middle opacity-80 dark:opacity-90"
          title="Synced from Google Calendar"
          data-testid="google-calendar-logo"
        />
      )}
    <span className="truncate">{event.title}</span>
  </>
);

export const AllDayEventBar = ({ dates }: { dates: Date[] }) => {
  const { settings, openModal, updateEvent, crossZoneDragState } = useCalendar();
  const { allDayEvents } = useCalendarSync();
  const showWeekends = settings.appearance.showWeekends;
  const tz = settings?.timezone?.timezone;
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  
  // Enhanced drag and drop state with cross-zone support
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedEvent: null,
    draggedEventSpan: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    targetDateIndex: null,
    originalDateIndex: -1,
    previewSpan: null,
    dragZone: null,
    targetZone: null,
    timeSlotTarget: null,
  });

  // Use ref to store the current drag state for stable handlers
  const dragStateRef = useRef<DragState>(dragState);
  dragStateRef.current = dragState;

  // Refs for drag handling
  const containerRef = useRef<HTMLDivElement>(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);

  // Add refs for drag threshold and timer
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragInitiated = useRef(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const DRAG_THRESHOLD = 5; // px
  const LONG_PRESS_DURATION = 250; // ms

  // Constants for layout
  const EVENT_LEFT_OFFSET = 4; // 4px offset from left edge

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day =
          tz === 'auto' ? dayjs(date).day() : dayjs(date).tz(tz).day();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Helper to detect drop zone based on mouse position
  const detectDropZone = useCallback((clientY: number) => {
    // Get the calendar container to determine boundaries
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) return 'all-day';
    
    const calendarRect = calendarView.getBoundingClientRect();
    const allDayContainer = containerRef.current;
    
    if (!allDayContainer) return 'all-day';
    
    const allDayRect = allDayContainer.getBoundingClientRect();
    
    // If mouse is below the all-day area and within calendar view, it's in timed area
    if (clientY > allDayRect.bottom && clientY < calendarRect.bottom) {
      return 'timed';
    }
    
    return 'all-day';
  }, []);

  // Helper to calculate time slot target
  const calculateTimeSlotTarget = useCallback((clientX: number, clientY: number) => {
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) return null;
    
    const calendarRect = calendarView.getBoundingClientRect();
    const relativeX = clientX - calendarRect.left - 64; // Account for time trail width
    const relativeY = clientY - calendarRect.top;
    
    // Calculate target date
    const columnWidth = (calendarRect.width - 64) / visibleDates.length; // Subtract time trail
    const dateIndex = Math.floor(relativeX / columnWidth);
    const clampedDateIndex = Math.max(0, Math.min(dateIndex, visibleDates.length - 1));
    const targetDate = visibleDates[clampedDateIndex];
    
    if (!targetDate) return null;
    
    // Calculate target time (assuming 80px per hour)
    const HOUR_HEIGHT = 80;
    const hour = Math.floor(relativeY / HOUR_HEIGHT);
    const minute = Math.floor(((relativeY % HOUR_HEIGHT) / HOUR_HEIGHT) * 60);
    
    // Round to nearest 15 minutes
    const roundedMinute = Math.round(minute / 15) * 15;
    const finalMinute = roundedMinute === 60 ? 0 : roundedMinute;
    const finalHour = roundedMinute === 60 ? hour + 1 : hour;
    
    return {
      date: targetDate,
      hour: Math.max(0, Math.min(finalHour, 23)),
      minute: finalMinute,
    };
  }, [visibleDates]);

  // Stable drag event handlers using refs
  const handleDragStart = useCallback((e: React.MouseEvent, eventSpan: EventSpan) => {
    // Don't allow dragging locked events
    if (eventSpan.event.locked) return;
    
    // Don't allow dragging if there are no visible dates or only one date
    if (visibleDates.length <= 1) return;
    
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate initial preview span
    const previewSpan = {
      startIndex: eventSpan.startIndex,
      span: eventSpan.span,
      row: eventSpan.row,
    };

    setDragState({
      isDragging: true,
      draggedEvent: eventSpan.event,
      draggedEventSpan: eventSpan,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      targetDateIndex: eventSpan.startIndex,
      originalDateIndex: eventSpan.startIndex,
      previewSpan,
      dragZone: 'all-day',
      targetZone: 'all-day',
      timeSlotTarget: null,
    });

    // Set cursor and prevent text selection
    document.body.style.cursor = 'grabbing';
    document.body.classList.add('select-none');
  }, [visibleDates.length]);

  // Enhanced drag move handler with seamless cross-zone detection
  const handleDragMove = useCallback((e: MouseEvent) => {
    const currentDragState = dragStateRef.current;
    if (!currentDragState.isDragging || !containerRef.current || !currentDragState.draggedEventSpan) return;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    
    // Seamless zone detection - no special indicators needed
    const targetZone = detectDropZone(e.clientY);
    let timeSlotTarget = null;
    let previewSpan = null;
    
    if (targetZone === 'timed') {
      // Calculate time slot target for seamless conversion
      timeSlotTarget = calculateTimeSlotTarget(e.clientX, e.clientY);
      // Hide the normal preview span when converting to timed
      previewSpan = null;
    } else {
      // Calculate date column target for all-day area
      const columnWidth = rect.width / visibleDates.length;
      const targetDateIndex = Math.floor(relativeX / columnWidth);
      const clampedTargetIndex = Math.max(0, Math.min(targetDateIndex, visibleDates.length - 1));

      // Calculate new preview span based on target position
      const originalSpan = currentDragState.draggedEventSpan.span;
      const newStartIndex = clampedTargetIndex;
      const newEndIndex = Math.min(newStartIndex + originalSpan - 1, visibleDates.length - 1);
      const adjustedSpan = newEndIndex - newStartIndex + 1;

      previewSpan = {
        startIndex: newStartIndex,
        span: adjustedSpan,
        row: currentDragState.draggedEventSpan.row,
      };
    }

    setDragState(prev => ({
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
      targetZone,
      timeSlotTarget,
      previewSpan,
      targetDateIndex: targetZone === 'all-day' ? Math.floor(relativeX / (rect.width / visibleDates.length)) : null,
    }));
  }, [visibleDates.length, detectDropZone, calculateTimeSlotTarget]);

  // Enhanced drag end handler with seamless cross-zone conversion
  const handleDragEnd = useCallback(async () => {
    const currentDragState = dragStateRef.current;
    if (!currentDragState.isDragging || !currentDragState.draggedEvent || !currentDragState.draggedEventSpan) return;

    const targetZone = currentDragState.targetZone;
    const originalDateIndex = currentDragState.originalDateIndex;

    // Helper for dayjs + timezone
    const getDayjsDate = (d: string | Date) => (tz === 'auto' ? dayjs(d) : dayjs(d).tz(tz));

    // Reset drag state and cursor
    setDragState({
      isDragging: false,
      draggedEvent: null,
      draggedEventSpan: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      targetDateIndex: null,
      originalDateIndex: -1,
      previewSpan: null,
      dragZone: null,
      targetZone: null,
      timeSlotTarget: null,
    });

    document.body.style.cursor = '';
    document.body.classList.remove('select-none');

    try {
      if (targetZone === 'timed' && currentDragState.timeSlotTarget) {
        // Seamless conversion to timed event
        const { date, hour, minute } = currentDragState.timeSlotTarget;
        const convertedEvent = createTimedEventFromAllDay(
          currentDragState.draggedEvent,
          date,
          hour,
          minute
        );

        if (typeof updateEvent === 'function') {
          await updateEvent(currentDragState.draggedEvent.id, {
            start_at: convertedEvent.start_at,
            end_at: convertedEvent.end_at,
            scheduling_note: convertedEvent.scheduling_note,
          });
        }
      } else if (targetZone === 'all-day' && currentDragState.targetDateIndex !== null) {
        // Handle all-day to all-day movement (existing logic)
        const targetDateIndex = currentDragState.targetDateIndex;
        
        if (targetDateIndex !== originalDateIndex) {
          const originalStartDate = getDayjsDate(visibleDates[originalDateIndex] ?? new Date());
          const targetStartDate = getDayjsDate(visibleDates[targetDateIndex] ?? new Date());
          const daysDiff = targetStartDate.diff(originalStartDate, 'day');
          const currentStart = getDayjsDate(currentDragState.draggedEvent.start_at);
          const currentEnd = getDayjsDate(currentDragState.draggedEvent.end_at);
          const newStart = currentStart.add(daysDiff, 'day');
          const newEnd = currentEnd.add(daysDiff, 'day');

          if (typeof updateEvent === 'function') {
            await updateEvent(currentDragState.draggedEvent.id, {
              start_at: newStart.toISOString(),
              end_at: newEnd.toISOString(),
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to update event:', error);
    }
  }, [visibleDates, tz, updateEvent]);

  // Set up global mouse event listeners with stable handlers
  React.useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [dragState.isDragging, handleDragMove, handleDragEnd]);

  // Process events to determine their spans across visible dates
  const eventLayout = useMemo((): EventLayout => {
    const spans: EventSpan[] = [];
    const eventsByDay: EventSpan[][] = Array(visibleDates.length)
      .fill(null)
      .map(() => []);

    // First pass: create event spans without row assignment
    const tempSpans: Omit<EventSpan, 'row'>[] = [];

    // Process each all-day event
    allDayEvents.forEach((event) => {
      const eventStart =
        tz === 'auto' ? dayjs(event.start_at) : dayjs(event.start_at).tz(tz);
      const eventEnd =
        tz === 'auto' ? dayjs(event.end_at) : dayjs(event.end_at).tz(tz);

      // Find the start and end indices within our visible dates
      let startIndex = -1;
      let endIndex = -1;

      // First pass: find any overlap with visible dates
      const firstVisibleDate =
        tz === 'auto' ? dayjs(visibleDates[0]) : dayjs(visibleDates[0]).tz(tz);
      const lastVisibleDate =
        tz === 'auto'
          ? dayjs(visibleDates[visibleDates.length - 1])
          : dayjs(visibleDates[visibleDates.length - 1]).tz(tz);

      // Check if event overlaps with our visible date range at all
      // Event overlaps if: event_start < visible_end AND event_end > visible_start
      const eventOverlaps =
        eventStart.isBefore(lastVisibleDate.add(1, 'day'), 'day') &&
        eventEnd.isAfter(firstVisibleDate, 'day');

      // Fix: For all-day events, end_at is exclusive (midnight of next day)
      // So a single-day all-day event has durationDays = 1, not 0
      // We need to check if it's actually more than 1 day
      const eventDurationDays = eventEnd.diff(eventStart, 'day');
      const isActuallyMultiDay = eventDurationDays > 1;

      if (!eventOverlaps) {
        return; // Skip this event if it doesn't overlap with visible dates
      }

      // Improved logic for multi-day events
      // Start index: first visible date that overlaps with the event
      if (eventStart.isSameOrBefore(firstVisibleDate, 'day')) {
        // Event starts before or on the first visible date
        startIndex = 0;
      } else {
        // Find the first visible date that matches the event start
        for (let i = 0; i < visibleDates.length; i++) {
          const currentDate = tz === 'auto' ? dayjs(visibleDates[i]) : dayjs(visibleDates[i]).tz(tz);
          if (currentDate.isSameOrAfter(eventStart, 'day') && currentDate.isBefore(eventEnd, 'day')) {
            startIndex = i;
            break;
          }
        }
      }

      // End index: last visible date that overlaps with the event
      if (eventEnd.isAfter(lastVisibleDate.add(1, 'day'), 'day')) {
        // Event ends after the last visible date
        endIndex = visibleDates.length - 1;
      } else {
        // Find the last visible date that the event covers
        for (let i = visibleDates.length - 1; i >= 0; i--) {
          const currentDate = tz === 'auto' ? dayjs(visibleDates[i]) : dayjs(visibleDates[i]).tz(tz);
          if (currentDate.isBefore(eventEnd, 'day') && currentDate.isSameOrAfter(eventStart, 'day')) {
            endIndex = i;
            break;
          }
        }
      }

      // Include events that have at least one day visible in our date range
      if (startIndex !== -1 && endIndex !== -1) {
        const span = endIndex - startIndex + 1;
        
        // Fix: Proper cut-off logic for all-day events
        // For all-day events, end_at is typically start of next day (exclusive)
        // So we need to check actual duration, not just date comparison
        // Use the same isActuallyMultiDay calculation from above
        
        // Only show cut-off indicators for events that actually span multiple days
        // AND are cut off by the visible range
        const isCutOffStart = isActuallyMultiDay && eventStart.isBefore(firstVisibleDate, 'day');
        const isCutOffEnd = isActuallyMultiDay && eventEnd.isAfter(lastVisibleDate.add(1, 'day'), 'day');
        
        const eventSpan: Omit<EventSpan, 'row'> = {
          event,
          startIndex,
          endIndex,
          span,
          // Add indicators for cut-off events
          isCutOffStart,
          isCutOffEnd,
          actualStartDate: eventStart,
          actualEndDate: eventEnd,
        };

        tempSpans.push(eventSpan);
      }
    });

    // Second pass: assign rows using proper stacking algorithm
    // Sort events by start date, then by duration (longer events first to minimize conflicts)
    const sortedTempSpans = tempSpans.sort((a, b) => {
      const startDiff = a.actualStartDate.diff(b.actualStartDate);
      if (startDiff !== 0) return startDiff;
      // If start dates are the same, longer events get priority (lower row numbers)
      return b.span - a.span;
    });

    // Track occupied rows for each day
    const occupiedRows: boolean[][] = Array(visibleDates.length)
      .fill(null)
      .map(() => []);

    // Assign rows to events
    sortedTempSpans.forEach((tempSpan) => {
      // Find the first available row that works for all days this event spans
      let row = 0;
      let rowFound = false;

      while (!rowFound) {
        // Check if this row is available for all days the event spans
        let canUseRow = true;
        for (let dayIndex = tempSpan.startIndex; dayIndex <= tempSpan.endIndex; dayIndex++) {
          if (occupiedRows[dayIndex]?.[row]) {
            canUseRow = false;
            break;
          }
        }

        if (canUseRow) {
          // Mark this row as occupied for all days the event spans
          for (let dayIndex = tempSpan.startIndex; dayIndex <= tempSpan.endIndex; dayIndex++) {
            if (!occupiedRows[dayIndex]) {
              occupiedRows[dayIndex] = [];
            }
            occupiedRows[dayIndex]![row] = true;
          }
          rowFound = true;
        } else {
          row++;
        }
      }

      // Create the final event span with row assignment
      const eventSpan: EventSpan = {
        ...tempSpan,
        row,
      };

      spans.push(eventSpan);

      // Add this event to each day it spans
      for (let i = tempSpan.startIndex; i <= tempSpan.endIndex; i++) {
        eventsByDay[i]?.push(eventSpan);
      }
    });

    // Calculate max visible events per day for layout purposes
    let maxVisibleEventsPerDay = 0;
    eventsByDay.forEach((dayEvents, dayIndex) => {
      const dateKey =
        tz === 'auto'
          ? dayjs(visibleDates[dayIndex]).format('YYYY-MM-DD')
          : dayjs(visibleDates[dayIndex]).tz(tz).format('YYYY-MM-DD');

      const shouldShowAll = dayEvents.length === MAX_EVENTS_DISPLAY + 1;
      const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
      const visibleCount = isExpanded
        ? dayEvents.length
        : Math.min(dayEvents.length, MAX_EVENTS_DISPLAY);

      maxVisibleEventsPerDay = Math.max(maxVisibleEventsPerDay, visibleCount);
    });

    return { spans, maxVisibleEventsPerDay, eventsByDay };
  }, [allDayEvents, visibleDates, tz, expandedDates]);

  // Get unique events for a specific date (for expansion logic)
  const getUniqueEventsForDate = (dateIndex: number): EventSpan[] => {
    return eventLayout.eventsByDay[dateIndex] ?? [];
  };

  const toggleDateExpansion = (dateKey: string) => {
    setExpandedDates((prev) =>
      prev.includes(dateKey)
        ? prev.filter((d) => d !== dateKey)
        : [...prev, dateKey]
    );
  };

  // Calculate dynamic height based on visible events (minimum height for drop zone)
  const barHeight = Math.max(1.9, eventLayout.maxVisibleEventsPerDay * 1.75);

  // Enhanced mouse and touch handlers
  const handleEventMouseDown = (e: React.MouseEvent, eventSpan: EventSpan) => {
    if (eventSpan.event.locked) return;
    if (visibleDates.length <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragInitiated.current = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartPos.current) return;
      const dx = moveEvent.clientX - dragStartPos.current.x;
      const dy = moveEvent.clientY - dragStartPos.current.y;
      if (!dragInitiated.current && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        dragInitiated.current = true;
        handleDragStart(e, eventSpan);
      }
      // If drag already started, let handleDragMove do its job
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!dragInitiated.current) {
        // Treat as click (open modal)
        openModal(eventSpan.event.id, 'all-day');
      }
      dragStartPos.current = null;
      dragInitiated.current = false;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleEventTouchStart = (e: React.TouchEvent, eventSpan: EventSpan) => {
    if (eventSpan.event.locked) return;
    if (visibleDates.length <= 1) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    dragInitiated.current = false;
    // Start long-press timer
    longPressTimer.current = setTimeout(() => {
      dragInitiated.current = true;
      handleDragStart({
        ...e,
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any, eventSpan);
    }, LONG_PRESS_DURATION);

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!dragStartPos.current) return;
      const moveTouch = moveEvent.touches[0];
      if (!moveTouch) return;
      const dx = moveTouch.clientX - dragStartPos.current.x;
      const dy = moveTouch.clientY - dragStartPos.current.y;
      if (!dragInitiated.current && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        // Cancel long-press, treat as scroll
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
        dragStartPos.current = null;
        dragInitiated.current = false;
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      }
    };
    const onTouchEnd = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      if (!dragInitiated.current) {
        // Treat as tap (open modal)
        openModal(eventSpan.event.id, 'all-day');
      }
      dragStartPos.current = null;
      dragInitiated.current = false;
    };
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  };

  return (
    <div className="flex">
      {/* Label column */}
      <div className="flex w-16 items-center justify-center border-b border-l bg-muted/30 p-2 font-medium">
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* All-day event columns with relative positioning for spanning events */}
      <div
        ref={containerRef}
        className={cn(
          'relative flex-1 border-b',
          // Add visual feedback for drop zone
          'transition-colors duration-200'
        )}
        data-testid="all-day-container"
        style={{
          minWidth: `${visibleDates.length * MIN_COLUMN_WIDTH}px`,
          height: `${barHeight}rem`,
        }}
      >
        {/* Grid background for date columns - this maintains proper borders */}
        <div
          className={cn('grid h-full')}
          style={{
            gridTemplateColumns: `repeat(${visibleDates.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleDates.map((date, dateIndex) => {
            const dateKey =
              tz === 'auto'
                ? dayjs(date).format('YYYY-MM-DD')
                : dayjs(date).tz(tz).format('YYYY-MM-DD');

            const dateEvents = getUniqueEventsForDate(dateIndex);
            const shouldShowAll = dateEvents.length === MAX_EVENTS_DISPLAY + 1;
            const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
            const hiddenCount =
              !isExpanded && !shouldShowAll
                ? Math.max(0, dateEvents.length - MAX_EVENTS_DISPLAY)
                : 0;

            // Check if this column is a drop target
            const isDropTarget = dragState.isDragging && dragState.targetDateIndex === dateIndex;
            const isOriginalColumn = dragState.isDragging && dragState.originalDateIndex === dateIndex;
            
            // Check if this column is a cross-zone drop target
            const isCrossZoneDropTarget = crossZoneDragState.isActive && 
              crossZoneDragState.targetZone === 'all-day' && 
              crossZoneDragState.targetDate &&
              dayjs(date).isSame(crossZoneDragState.targetDate, 'day');

            return (
              <div
                key={`all-day-column-${dateKey}`}
                className={cn(
                  "group flex h-full flex-col justify-start border-l last:border-r transition-colors duration-200",
                  // Drop zone visual feedback for internal all-day dragging
                  isDropTarget && !isOriginalColumn && "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700",
                  isOriginalColumn && "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700",
                  // Cross-zone drop target visual feedback
                  isCrossZoneDropTarget && "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 ring-2 ring-green-400/50",
                  // Normal hover state (only when not dragging)
                  !dragState.isDragging && !crossZoneDragState.isActive && "hover:bg-muted/20"
                )}
              >
                {/* Show/hide expansion button */}
                {hiddenCount > 0 && (
                  <div
                    className="flex cursor-pointer items-center justify-center rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
                    onClick={() => toggleDateExpansion(dateKey)}
                    style={{
                      position: 'absolute',
                      top: `${MAX_EVENTS_DISPLAY * 1.7}rem`,
                      left: `${(dateIndex * 100) / visibleDates.length}%`,
                      width: `${100 / visibleDates.length}%`,
                      zIndex: 10,
                    }}
                  >
                    <ChevronDown className="mr-1 h-3 w-3" />
                    {hiddenCount} more
                  </div>
                )}

                {isExpanded &&
                  !shouldShowAll &&
                  dateEvents.length > MAX_EVENTS_DISPLAY && (
                    <div
                      className="flex cursor-pointer items-center justify-center rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
                      onClick={() => toggleDateExpansion(dateKey)}
                      style={{
                        position: 'absolute',
                        top: `${dateEvents.length * 1.7}rem`,
                        left: `${(dateIndex * 100) / visibleDates.length}%`,
                        width: `${100 / visibleDates.length}%`,
                        zIndex: 10,
                      }}
                    >
                      <ChevronUp className="mr-1 h-3 w-3" />
                      Show less
                    </div>
                  )}

                {/* Cross-zone drop indicator */}
                {isCrossZoneDropTarget && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ zIndex: 15 }}
                  >
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-500 text-white text-xs font-medium rounded-full shadow-lg animate-pulse">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Drop here
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Seamless drag preview - no special indicators needed */}
        {dragState.isDragging && dragState.previewSpan && dragState.draggedEvent && dragState.targetZone === 'all-day' && (
          <div
            className={cn(
              'absolute rounded-sm border-2 border-dashed transition-all duration-150',
              'bg-blue-100/60 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600',
              'pointer-events-none'
            )}
            style={{
              left: `calc(${(dragState.previewSpan.startIndex * 100) / visibleDates.length}% + ${EVENT_LEFT_OFFSET}px)`,
              width: `calc(${(dragState.previewSpan.span * 100) / visibleDates.length}% - ${EVENT_LEFT_OFFSET * 2}px)`,
              top: `${dragState.previewSpan.row * 1.6 + 0.25}rem`,
              height: '1.35rem',
              zIndex: 8,
            }}
          />
        )}

        {/* Absolute positioned spanning events */}
        {eventLayout.spans.map((eventSpan) => {
          const { event, startIndex, span, row, isCutOffStart, isCutOffEnd } = eventSpan;
          const { bg, border, text } = getEventStyles(event.color || 'BLUE');

          // Use the assigned row directly instead of calculating it
          const eventRow = row;

          // Check if this event should be visible based on expansion state
          const shouldHideEvent = visibleDates.some((date, dateIndex) => {
            if (dateIndex < startIndex || dateIndex > startIndex + span - 1)
              return false;

            const dateKey =
              tz === 'auto'
                ? dayjs(date).format('YYYY-MM-DD')
                : dayjs(date).tz(tz).format('YYYY-MM-DD');

            const dateEvents = getUniqueEventsForDate(dateIndex);
            const shouldShowAll = dateEvents.length === MAX_EVENTS_DISPLAY + 1;
            const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
            const visibleCount = isExpanded
              ? dateEvents.length
              : Math.min(dateEvents.length, MAX_EVENTS_DISPLAY);

            return eventRow >= visibleCount;
          });

          if (shouldHideEvent) return null;

          // Check if this event is currently being dragged
          const isDraggedEvent = dragState.isDragging && dragState.draggedEvent?.id === event.id;

          return (
            <div
              key={`spanning-event-${event.id}`}
              className={cn(
                'absolute flex items-center rounded-sm border-l-2 px-2 py-1 text-xs font-semibold transition-all duration-200',
                // Cursor changes based on locked state and drag state
                event.locked 
                  ? 'cursor-not-allowed opacity-60' 
                  : dragState.isDragging 
                    ? 'cursor-grabbing' 
                    : 'cursor-grab hover:cursor-grab',
                // Seamless visual feedback during cross-zone dragging
                isDraggedEvent && dragState.targetZone === 'timed' && 'opacity-50 scale-95',
                isDraggedEvent && dragState.targetZone === 'all-day' && 'opacity-30 scale-95',
                // Normal styling
                bg,
                border,
                text,
                // Special styling for cut-off events
                (isCutOffStart || isCutOffEnd) && 'border-dashed'
              )}
              style={{
                left: `calc(${(startIndex * 100) / visibleDates.length}% + ${EVENT_LEFT_OFFSET}px)`,
                width: `calc(${(span * 100) / visibleDates.length}% - ${EVENT_LEFT_OFFSET * 2}px)`,
                top: `${eventRow * 1.6 + 0.25}rem`,
                height: '1.35rem',
                zIndex: isDraggedEvent ? 10 : 5,
              }}
              onClick={() => {
                // Only open modal if not dragging and not locked
                if (!dragState.isDragging && !event.locked) {
                  openModal(event.id, 'all-day');
                }
              }}
              onMouseDown={(e) => handleEventMouseDown(e, eventSpan)}
              onTouchStart={(e) => handleEventTouchStart(e, eventSpan)}
            >
              {/* Cut-off indicator for events that start before visible range */}
              {isCutOffStart && (
                <span className="mr-1 text-xs opacity-75" title="Event continues from previous days">
                  ←
                </span>
              )}
              {/* Use shared EventContent component */}
              <EventContent event={event} />
              {/* Cut-off indicator for events that end after visible range */}
              {isCutOffEnd && (
                <span className="ml-1 text-xs opacity-75" title="Event continues to next days">
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Seamless drag preview with subtle feedback */}
      {dragState.isDragging && dragState.draggedEvent && (
        <div
          ref={dragPreviewRef}
          className={cn(
            'fixed pointer-events-none z-50 truncate rounded-sm border-l-2 px-2 py-1 text-xs font-semibold shadow-xl',
            'transform transition-none backdrop-blur-sm',
            getEventStyles(dragState.draggedEvent.color || 'BLUE').bg,
            getEventStyles(dragState.draggedEvent.color || 'BLUE').border,
            getEventStyles(dragState.draggedEvent.color || 'BLUE').text,
            'opacity-90'
          )}
          style={{
            left: `${dragState.currentX + 15}px`,
            top: `${dragState.currentY - 20}px`,
            height: '1.35rem',
            minWidth: '120px',
            maxWidth: '250px',
            transform: 'rotate(-2deg)',
          }}
        >
          <EventContent event={dragState.draggedEvent} />
        </div>
      )}
    </div>
  );
};
