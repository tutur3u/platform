import { Calendar, ChevronDown, ChevronUp } from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import timezone from 'dayjs/plugin/timezone';
import Image from 'next/image';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { MIN_COLUMN_WIDTH } from './config';
import { getLocationType, LocationTimeline } from './location-timeline';
import { useCalendarSettings } from './settings/settings-context';

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
  isCutOffEnd: boolean; // Event ends after visible range
  actualStartDate: dayjs.Dayjs; // Actual start date of the event
  actualEndDate: dayjs.Dayjs; // Actual end date of the event
  row: number; // Add row property for proper stacking
  // For merged events
  isMerged?: boolean;
  mergedEventIds?: string[];
}

interface EventLayout {
  spans: EventSpan[];
  maxVisibleEventsPerDay: number;
  eventsByDay: EventSpan[][];
  locationSpansFromMerge: EventSpan[];
}

// Drag state interface
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
}

// 1. Extract EventContent component for shared rendering
const EventContent = ({ event }: { event: CalendarEvent }) => (
  <>
    {typeof event.google_event_id === 'string' &&
      event.google_event_id.trim() !== '' && (
        <Image
          src="/media/google-calendar-icon.png"
          alt="Google Calendar"
          className="mr-1 inline-block h-[1.25em] w-[1.25em] align-middle opacity-80 dark:opacity-90"
          title="Synced from Google Calendar"
          data-testid="google-calendar-logo"
          width={18}
          height={18}
        />
      )}
    <span className="truncate">{event.title}</span>
  </>
);

export const AllDayEventBar = ({ dates }: { dates: Date[] }) => {
  const { openModal, updateEvent, addEvent, deleteEvent } = useCalendar();
  const { allDayEvents } = useCalendarSync();
  const { settings } = useCalendarSettings();
  const showWeekends = settings.appearance.showWeekends;
  const tz = settings?.timezone?.timezone;
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  // Drag and drop state
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
  /** Height of the LocationTimeline strip in rem. Used to offset regular events when location events are present. */
  const LOCATION_TIMELINE_HEIGHT_REM = 1.5;

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day =
          tz === 'auto' ? dayjs(date).day() : dayjs(date).tz(tz).day();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Stable drag event handlers using refs
  const handleDragStart = useCallback(
    (e: React.MouseEvent, eventSpan: EventSpan) => {
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
      });

      // Set cursor and prevent text selection
      document.body.style.cursor = 'grabbing';
      document.body.classList.add('select-none');
    },
    [visibleDates.length]
  );

  // Stable drag move handler
  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      const currentDragState = dragStateRef.current;
      if (
        !currentDragState.isDragging ||
        !containerRef.current ||
        !currentDragState.draggedEventSpan
      )
        return;

      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;

      // Calculate which date column we're over
      const columnWidth = rect.width / visibleDates.length;
      const targetDateIndex = Math.floor(relativeX / columnWidth);
      const clampedTargetIndex = Math.max(
        0,
        Math.min(targetDateIndex, visibleDates.length - 1)
      );

      // Calculate new preview span based on target position
      const originalSpan = currentDragState.draggedEventSpan.span;
      const newStartIndex = clampedTargetIndex;
      const newEndIndex = Math.min(
        newStartIndex + originalSpan - 1,
        visibleDates.length - 1
      );
      const adjustedSpan = newEndIndex - newStartIndex + 1;

      const previewSpan = {
        startIndex: newStartIndex,
        span: adjustedSpan,
        row: currentDragState.draggedEventSpan.row,
      };

      setDragState((prev) => ({
        ...prev,
        currentX: e.clientX,
        currentY: e.clientY,
        targetDateIndex: clampedTargetIndex,
        previewSpan,
      }));
    },
    [visibleDates.length]
  );

  // Stable drag end handler
  const handleDragEnd = useCallback(async () => {
    const currentDragState = dragStateRef.current;
    if (
      !currentDragState.isDragging ||
      !currentDragState.draggedEvent ||
      !currentDragState.draggedEventSpan
    )
      return;

    const targetDateIndex = currentDragState.targetDateIndex;
    const originalDateIndex = currentDragState.originalDateIndex;

    // Only validate originalDateIndex (targetDateIndex is always clamped)
    if (originalDateIndex < 0 || originalDateIndex >= visibleDates.length) {
      console.warn('Invalid original date index for drag operation');
      return;
    }

    // Helper for dayjs + timezone
    const getDayjsDate = (d: string | Date) =>
      tz === 'auto' ? dayjs(d) : dayjs(d).tz(tz);

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
    });

    document.body.style.cursor = '';
    document.body.classList.remove('select-none');

    // If dropped on the same date or invalid target, do nothing
    if (targetDateIndex === null || targetDateIndex === originalDateIndex) {
      return;
    }

    try {
      // Use helper for all dayjs conversions
      const originalStartDate = getDayjsDate(
        visibleDates[originalDateIndex] ?? new Date()
      );
      const targetStartDate = getDayjsDate(
        visibleDates[targetDateIndex] ?? new Date()
      );
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
      } else {
        console.warn('updateEvent function not available');
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

      // Debug logging for multi-day events
      const eventDurationDays = eventEnd.diff(eventStart, 'day');
      if (eventDurationDays > 0) {
        console.log('Multi-day event processing:', {
          title: event.title,
          eventStart: eventStart.format('YYYY-MM-DD'),
          eventEnd: eventEnd.format('YYYY-MM-DD'),
          durationDays: eventDurationDays,
          isActuallyMultiDay: eventDurationDays > 1,
          firstVisibleDate: firstVisibleDate.format('YYYY-MM-DD'),
          lastVisibleDate: lastVisibleDate.format('YYYY-MM-DD'),
          eventOverlaps,
          wouldShowCutOffStart:
            eventDurationDays > 1 &&
            eventStart.isBefore(firstVisibleDate, 'day'),
          wouldShowCutOffEnd:
            eventDurationDays > 1 &&
            eventEnd.isAfter(lastVisibleDate.add(1, 'day'), 'day'),
        });
      }

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
          const currentDate =
            tz === 'auto'
              ? dayjs(visibleDates[i])
              : dayjs(visibleDates[i]).tz(tz);
          if (
            currentDate.isSameOrAfter(eventStart, 'day') &&
            currentDate.isBefore(eventEnd, 'day')
          ) {
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
          const currentDate =
            tz === 'auto'
              ? dayjs(visibleDates[i])
              : dayjs(visibleDates[i]).tz(tz);
          if (
            currentDate.isBefore(eventEnd, 'day') &&
            currentDate.isSameOrAfter(eventStart, 'day')
          ) {
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
        const actualDurationDays = eventEnd.diff(eventStart, 'day');
        const isActuallyMultiDay = actualDurationDays > 1;

        // Only show cut-off indicators for events that actually span multiple days
        // AND are cut off by the visible range
        const isCutOffStart =
          isActuallyMultiDay && eventStart.isBefore(firstVisibleDate, 'day');
        const isCutOffEnd =
          isActuallyMultiDay &&
          eventEnd.isAfter(lastVisibleDate.add(1, 'day'), 'day');

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

    // Second pass: Merge consecutive SINGLE-DAY events with same title and color
    // Optimized O(n log n) approach: group by mergeKey, sort groups, linear scan per group
    const mergedTempSpans: Omit<EventSpan, 'row'>[] = [];

    // Group single-day spans by mergeKey; multi-day events go directly to output
    const groups = new Map<string, Omit<EventSpan, 'row'>[]>();

    for (const span of tempSpans) {
      if (span.span !== 1) {
        // Multi-day events - don't merge, just add directly
        mergedTempSpans.push(span);
        continue;
      }

      const mergeKey = `${(span.event.title ?? '').toLowerCase().trim()}|${span.event.color ?? 'BLUE'}`;
      const group = groups.get(mergeKey) ?? [];
      group.push(span);
      groups.set(mergeKey, group);
    }

    // Process each group with linear merge
    for (const [, group] of groups) {
      // Sort by startIndex (O(k log k) per group, where k is group size)
      group.sort((a, b) => a.startIndex - b.startIndex);

      let currentMerged: Omit<EventSpan, 'row'> | null = null;
      let mergedIds: string[] = [];

      for (const span of group) {
        if (!currentMerged) {
          // Start a new potential merge chain
          currentMerged = { ...span };
          mergedIds = [span.event.id];
        } else if (span.startIndex === currentMerged.endIndex + 1) {
          // Adjacent - extend the merge
          currentMerged.endIndex = span.endIndex;
          currentMerged.span =
            currentMerged.endIndex - currentMerged.startIndex + 1;
          currentMerged.isCutOffEnd =
            currentMerged.isCutOffEnd || span.isCutOffEnd;
          currentMerged.actualEndDate = currentMerged.actualEndDate.isAfter(
            span.actualEndDate
          )
            ? currentMerged.actualEndDate
            : span.actualEndDate;
          mergedIds.push(span.event.id);
        } else {
          // Gap - push current merged span and start a new one
          if (mergedIds.length > 1) {
            currentMerged.isMerged = true;
            currentMerged.mergedEventIds = mergedIds;
          }
          mergedTempSpans.push(currentMerged);
          currentMerged = { ...span };
          mergedIds = [span.event.id];
        }
      }

      // Push the final merged span from this group
      if (currentMerged) {
        if (mergedIds.length > 1) {
          currentMerged.isMerged = true;
          currentMerged.mergedEventIds = mergedIds;
        }
        mergedTempSpans.push(currentMerged);
      }
    }

    // Sort final output by startIndex for consistent ordering
    mergedTempSpans.sort((a, b) => a.startIndex - b.startIndex);

    // Third pass: assign rows (ONLY for non-location events)
    // Location events will be rendered separately as a compact timeline strip
    // Extract location spans before filtering them out for row assignment
    const locationSpansFromMerge = mergedTempSpans
      .filter((span) => getLocationType(span.event.title ?? '') !== null)
      .map((span) => ({ ...span, row: 0 })); // Give them row 0 as placeholder

    const nonLocationSpans = mergedTempSpans.filter(
      (span) => getLocationType(span.event.title ?? '') === null
    );

    // Sort: 1) by span length (longer events first for better packing), 2) by start date
    const sortedTempSpans = nonLocationSpans.sort((a, b) => {
      // Longer events first (they need to claim their full row first)
      const spanDiff = b.span - a.span;
      if (spanDiff !== 0) return spanDiff;

      // Then by start date
      return a.actualStartDate.diff(b.actualStartDate);
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
        for (
          let dayIndex = tempSpan.startIndex;
          dayIndex <= tempSpan.endIndex;
          dayIndex++
        ) {
          if (occupiedRows[dayIndex]?.[row]) {
            canUseRow = false;
            break;
          }
        }

        if (canUseRow) {
          // Mark this row as occupied for all days the event spans
          for (
            let dayIndex = tempSpan.startIndex;
            dayIndex <= tempSpan.endIndex;
            dayIndex++
          ) {
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

    return {
      spans,
      maxVisibleEventsPerDay,
      eventsByDay,
      locationSpansFromMerge,
    };
  }, [allDayEvents, visibleDates, tz, expandedDates]);

  // Extract location events (Home/Office) for compact timeline display
  // Deduplicate: only show one location event per day cell (first one wins)
  const locationSpans = useMemo(() => {
    const allLocationSpans = eventLayout.locationSpansFromMerge || [];

    // Track which day indices have been claimed by a location event
    const claimedDays = new Set<number>();
    const deduplicatedSpans: EventSpan[] = [];

    // Sort by start index to process in order
    const sortedSpans = [...allLocationSpans].sort(
      (a, b) => a.startIndex - b.startIndex
    );

    for (const span of sortedSpans) {
      // Check if any day in this span is already claimed
      let hasConflict = false;
      for (let day = span.startIndex; day <= span.endIndex; day++) {
        if (claimedDays.has(day)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        // Claim all days for this span
        for (let day = span.startIndex; day <= span.endIndex; day++) {
          claimedDays.add(day);
        }
        deduplicatedSpans.push(span);
      }
    }

    return deduplicatedSpans;
  }, [eventLayout.locationSpansFromMerge]);

  // Get non-location spans for regular event display
  const regularSpans = useMemo(() => {
    return eventLayout.spans.filter(
      (span) => getLocationType(span.event.title ?? '') === null
    );
  }, [eventLayout.spans]);

  // Get unique events for a specific date (for expansion logic)
  const getUniqueEventsForDate = (dateIndex: number): EventSpan[] => {
    return eventLayout.eventsByDay[dateIndex] ?? [];
  };

  // Check if we have any all-day events to display
  if (eventLayout.spans.length === 0) {
    return null;
  }

  const toggleDateExpansion = (dateKey: string) => {
    setExpandedDates((prev) =>
      prev.includes(dateKey)
        ? prev.filter((d) => d !== dateKey)
        : [...prev, dateKey]
    );
  };

  // Calculate dynamic height based on visible events
  const barHeight = Math.max(1.9, eventLayout.maxVisibleEventsPerDay * 1.75);

  // Enhanced mouse and touch handlers
  const handleEventMouseDown = (e: React.MouseEvent, eventSpan: EventSpan) => {
    if (visibleDates.length <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragInitiated.current = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartPos.current) return;
      const dx = moveEvent.clientX - dragStartPos.current.x;
      const dy = moveEvent.clientY - dragStartPos.current.y;
      if (
        !dragInitiated.current &&
        Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD
      ) {
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
    if (visibleDates.length <= 1) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    dragInitiated.current = false;
    // Start long-press timer
    longPressTimer.current = setTimeout(() => {
      dragInitiated.current = true;
      handleDragStart(
        {
          ...e,
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as any,
        eventSpan
      );
    }, LONG_PRESS_DURATION);

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!dragStartPos.current) return;
      const moveTouch = moveEvent.touches[0];
      if (!moveTouch) return;
      const dx = moveTouch.clientX - dragStartPos.current.x;
      const dy = moveTouch.clientY - dragStartPos.current.y;
      if (
        !dragInitiated.current &&
        Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD
      ) {
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
        className={cn('relative flex-1 overflow-hidden border-b')}
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
            const isDropTarget =
              dragState.isDragging && dragState.targetDateIndex === dateIndex;
            const isOriginalColumn =
              dragState.isDragging && dragState.originalDateIndex === dateIndex;

            return (
              <div
                key={`all-day-column-${dateKey}`}
                className={cn(
                  'group flex h-full flex-col justify-start border-l transition-colors duration-200 last:border-r',
                  // Drop zone visual feedback
                  isDropTarget &&
                    !isOriginalColumn &&
                    'border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30',
                  isOriginalColumn &&
                    'border-red-300 bg-red-100 dark:border-red-700 dark:bg-red-900/30',
                  // Normal hover state (only when not dragging)
                  !dragState.isDragging && 'hover:bg-muted/20'
                )}
              >
                {/* Show/hide expansion button */}
                {hiddenCount > 0 && (
                  <div
                    className="flex cursor-pointer items-center justify-center rounded-sm px-2 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/40"
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
                      className="flex cursor-pointer items-center justify-center rounded-sm px-2 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/40"
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
              </div>
            );
          })}
        </div>

        {/* Drag preview span - shows where the event will be placed */}
        {dragState.isDragging &&
          dragState.previewSpan &&
          dragState.draggedEvent && (
            <div
              className={cn(
                'absolute rounded-sm border-2 border-dashed transition-all duration-150',
                'border-blue-400 bg-blue-100/60 dark:border-blue-600 dark:bg-blue-900/30',
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
        {/* Location timeline strip at the top */}
        <LocationTimeline
          visibleDates={visibleDates}
          locationSpans={locationSpans}
          tz={tz}
          addEvent={addEvent}
          updateEvent={updateEvent}
          openModal={openModal}
          deleteEvent={deleteEvent}
        />

        {/* Absolute positioned spanning events */}
        {regularSpans.map((eventSpan) => {
          const { event, startIndex, span, row, isCutOffStart, isCutOffEnd } =
            eventSpan;
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
          const isDraggedEvent =
            dragState.isDragging && dragState.draggedEvent?.id === event.id;

          // Calculate top offset based on location strip presence
          const topOffset =
            locationSpans.length > 0 ? LOCATION_TIMELINE_HEIGHT_REM : 0;

          return (
            <div
              key={`spanning-event-${event.id}`}
              className={cn(
                'absolute flex items-center rounded-sm border-l-2 px-2 py-1 font-semibold text-xs transition-all duration-200',
                // Cursor changes based on drag state
                dragState.isDragging
                  ? 'cursor-grabbing'
                  : 'cursor-grab hover:cursor-grab',
                // Visual feedback for dragging
                isDraggedEvent && 'scale-95 opacity-30',
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
                top: `${eventRow * 1.6 + 0.25 + topOffset}rem`,
                height: '1.35rem',
                zIndex: isDraggedEvent ? 10 : 5,
              }}
              onClick={() => {
                // Only open modal if not dragging (locked events can still be clicked to edit)
                if (!dragState.isDragging) {
                  openModal(event.id, 'all-day');
                }
              }}
              onMouseDown={(e) => handleEventMouseDown(e, eventSpan)}
              onTouchStart={(e) => handleEventTouchStart(e, eventSpan)}
            >
              {/* Cut-off indicator for events that start before visible range */}
              {isCutOffStart && (
                <span
                  className="mr-1 text-xs opacity-75"
                  title="Event continues from previous days"
                >
                  ←
                </span>
              )}
              {/* Use shared EventContent component */}
              <EventContent event={event} />
              {/* Cut-off indicator for events that end after visible range */}
              {isCutOffEnd && (
                <span
                  className="ml-1 text-xs opacity-75"
                  title="Event continues to next days"
                >
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Enhanced drag preview with better positioning */}
      {dragState.isDragging && dragState.draggedEvent && (
        <div
          ref={dragPreviewRef}
          className={cn(
            'pointer-events-none fixed z-50 truncate rounded-sm border-l-2 px-2 py-1 font-semibold text-xs shadow-xl',
            'transform backdrop-blur-sm transition-none',
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
          {/* Use shared EventContent component */}
          <EventContent event={dragState.draggedEvent} />
        </div>
      )}
    </div>
  );
};
