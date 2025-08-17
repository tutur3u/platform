import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendar } from '../../../../hooks/use-calendar';
import { useCalendarSync } from '../../../../hooks/use-calendar-sync';
import { useCalendarSettings } from './settings/settings-context';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { MIN_COLUMN_WIDTH } from './config';
import { TimeColumnHeaders } from './time-column-headers';

dayjs.extend(utc);
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
}

interface EventLayout {
  spans: EventSpan[];
  maxVisibleEventsPerDay: number;
  eventsByDay: EventSpan[][];
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
        <svg
          className="mr-1 inline-block h-[1.25em] w-[1.25em] align-middle opacity-80 dark:opacity-90"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-label="Synced from Google Calendar"
          data-testid="google-calendar-logo"
        >
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
        </svg>
      )}
    <span className="truncate">{event.title}</span>
  </>
);

export const AllDayEventBar = ({ dates }: { dates: Date[] }) => {
  const { openModal, updateEvent } = useCalendar();
  const { allDayEvents } = useCalendarSync();
  const { settings } = useCalendarSettings();
  const showWeekends = settings.appearance.showWeekends;
  const tz = settings?.timezone?.timezone;
  const secondaryTz = settings?.timezone?.secondaryTimezone;
  const showSecondary = Boolean(
    settings?.timezone?.showSecondaryTimezone && secondaryTz
  );
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  // Helper function to safely convert dates to timezone
  const toTz = useCallback(
    (d: string | Date) => {
      return !tz || tz === 'auto' ? dayjs(d) : dayjs(d).tz(tz);
    },
    [tz]
  );

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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DRAG_THRESHOLD = 5; // px
  const LONG_PRESS_DURATION = 250; // ms

  // Constants for layout
  const EVENT_LEFT_OFFSET = 4; // 4px offset from left edge
  const EVENT_HEIGHT_REM = 1.35;
  const ROW_HEIGHT_REM = 1.6;         // Used for vertical placement of rows
  const ROW_TOP_OFFSET_REM = 0.25;    // Additional top offset per row
  const EXPANSION_BTN_ROW_MULTIPLIER = 1.7;
  const BAR_BASE_HEIGHT_REM = 1.9;
  const HEIGHT_PER_EVENT_REM = 1.75;

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day = toTz(date).day();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Stable drag event handlers using refs
  const handleDragStart = useCallback(
    (x: number, y: number, eventSpan: EventSpan) => {
      // Don't allow dragging locked events
      if (eventSpan.event.locked) return;

      // Don't allow dragging if there are no visible dates or only one date
      if (visibleDates.length <= 1) return;

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
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
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
      // Use toTz for all conversions
      const originalStartDate = toTz(
        visibleDates[originalDateIndex] ?? new Date()
      );
      const targetStartDate = toTz(visibleDates[targetDateIndex] ?? new Date());
      const daysDiff = targetStartDate.diff(originalStartDate, 'day');
      const currentStart = toTz(currentDragState.draggedEvent.start_at);
      const currentEnd = toTz(currentDragState.draggedEvent.end_at);
      const newStart = currentStart.add(daysDiff, 'day');
      const newEnd = currentEnd.add(daysDiff, 'day');

      if (typeof updateEvent === 'function') {
        await updateEvent(currentDragState.draggedEvent.id, {
          // Normalize to local midnight for all-day events
          start_at: newStart.startOf('day').toISOString(),
          end_at: newEnd.startOf('day').toISOString(),
        });
      } else {
        console.warn('updateEvent function not available');
      }
    } catch (error) {
      console.error('Failed to update event:', error);
      // NOTE: Consider surfacing this error to the user via toast/snackbar
      // Optionally revert optimistic UI if updateEvent throws (tracked in issue XYZ-1234)
    }
  }, [visibleDates, toTz, updateEvent]);

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

  // Cleanup any pending long-press timers on unmount
  React.useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  // Process events to determine their spans across visible dates
  const eventLayout = useMemo((): EventLayout => {
    // If there are no visible dates, nothing to layout
    if (visibleDates.length === 0) {
      return { spans: [], maxVisibleEventsPerDay: 0, eventsByDay: [] };
    }

    const spans: EventSpan[] = [];
    const eventsByDay: EventSpan[][] = Array(visibleDates.length)
      .fill(null)
      .map(() => []);

    // First pass: create event spans without row assignment
    const tempSpans: Omit<EventSpan, 'row'>[] = [];

    // Process each all-day event
    allDayEvents.forEach((event) => {
      const eventStart = toTz(event.start_at);
      const eventEnd = toTz(event.end_at);

      // Find the start and end indices within our visible dates
      let startIndex = -1;
      let endIndex = -1;

      // First pass: find any overlap with visible dates
      const firstVisibleDate = toTz(visibleDates[0]!);
      const lastVisibleDate = toTz(visibleDates[visibleDates.length - 1]!);

      // Check if event overlaps with our visible date range at all
      // Event overlaps if: event_start < visible_end AND event_end > visible_start
      const eventOverlaps =
        eventStart.isBefore(lastVisibleDate.add(1, 'day'), 'day') &&
        eventEnd.isAfter(firstVisibleDate, 'day');

      // Debug logging for multi-day events
      const eventDurationDays = eventEnd.diff(eventStart, 'day');
      if (process.env.NODE_ENV === 'development' && eventDurationDays > 0) {
        // eslint-disable-next-line no-console
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
          const currentDate = toTz(visibleDates[i]!);
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
          const currentDate = toTz(visibleDates[i]!);
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
      const dateKey = toTz(visibleDates[dayIndex]!).format('YYYY-MM-DD');

      const shouldShowAll = dayEvents.length === MAX_EVENTS_DISPLAY + 1;
      const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
      const visibleCount = isExpanded
        ? dayEvents.length
        : Math.min(dayEvents.length, MAX_EVENTS_DISPLAY);

      maxVisibleEventsPerDay = Math.max(maxVisibleEventsPerDay, visibleCount);
    });

    return { spans, maxVisibleEventsPerDay, eventsByDay };
  }, [allDayEvents, visibleDates, toTz, expandedDates]);

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
  const barHeight = Math.max(BAR_BASE_HEIGHT_REM, eventLayout.maxVisibleEventsPerDay * HEIGHT_PER_EVENT_REM);

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
      if (
        !dragInitiated.current &&
        Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD
      ) {
        dragInitiated.current = true;
        handleDragStart(e.clientX, e.clientY, eventSpan);
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
      handleDragStart(
        touch.clientX,
        touch.clientY,
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
      {/* Time column headers - matching the main calendar layout */}
      <TimeColumnHeaders showSecondary={showSecondary} variant="all-day" />

      {/* All-day event columns with relative positioning for spanning events */}
      <div
        ref={containerRef}
        className={cn('relative flex-1 border-b')}
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
            const dateKey = toTz(date).format('YYYY-MM-DD');

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
                  <button
                    type="button"
                    aria-expanded={false}
                    className="flex items-center justify-center rounded-sm px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted/40"
                    onClick={() => toggleDateExpansion(dateKey)}
                    style={{
                      position: 'absolute',
                      top: `${MAX_EVENTS_DISPLAY * EXPANSION_BTN_ROW_MULTIPLIER}rem`,
                      left: `${(dateIndex * 100) / visibleDates.length}%`,
                      width: `${100 / visibleDates.length}%`,
                      zIndex: 10,
                    }}
                  >
                    <ChevronDown className="mr-1 h-3 w-3" />
                    {hiddenCount} more
                  </button>
                )}

                {isExpanded &&
                  !shouldShowAll &&
                  dateEvents.length > MAX_EVENTS_DISPLAY && (
                    <button
                      type="button"
                      aria-expanded={true}
                      className="flex items-center justify-center rounded-sm px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted/40"
                      onClick={() => toggleDateExpansion(dateKey)}
                      style={{
                        position: 'absolute',
                        top: `${dateEvents.length * EXPANSION_BTN_ROW_MULTIPLIER}rem`,
                        left: `${(dateIndex * 100) / visibleDates.length}%`,
                        width: `${100 / visibleDates.length}%`,
                        zIndex: 10,
                      }}
                    >
                      <ChevronUp className="mr-1 h-3 w-3" />
                      Show less
                    </button>
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
                top: `${dragState.previewSpan.row * ROW_HEIGHT_REM + ROW_TOP_OFFSET_REM}rem`,
                height: `${EVENT_HEIGHT_REM}rem`,
                zIndex: 8,
              }}
            />
          )}

        {/* Absolute positioned spanning events */}
        {eventLayout.spans.map((eventSpan) => {
          const { event, startIndex, span, row, isCutOffStart, isCutOffEnd } =
            eventSpan;
          const { bg, border, text } = getEventStyles(event.color || 'BLUE');

          // Use the assigned row directly instead of calculating it
          const eventRow = row;

          // Check if this event should be visible based on expansion state
          const shouldHideEvent = visibleDates.some((date, dateIndex) => {
            if (dateIndex < startIndex || dateIndex > startIndex + span - 1)
              return false;

            const dateKey = toTz(date).format('YYYY-MM-DD');

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

          return (
            <div
              key={`spanning-event-${event.id}`}
              className={cn(
                'absolute flex items-center rounded-sm border-l-2 px-2 py-1 font-semibold transition-all duration-200',
                // Cursor changes based on locked state and drag state
                event.locked
                  ? 'cursor-not-allowed opacity-60'
                  : dragState.isDragging
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
                top: `${eventRow * ROW_HEIGHT_REM + ROW_TOP_OFFSET_REM}rem`,
                height: `${EVENT_HEIGHT_REM}rem`,
                zIndex: isDraggedEvent ? 10 : 5,
              }}
              role="button"
              tabIndex={0}
              aria-label={`${event.title} (all-day event)`}
              onClick={() => {
                // Only open modal if not dragging and not locked
                if (!dragState.isDragging && !event.locked) {
                  openModal(event.id, 'all-day');
                }
              }}
              onKeyDown={(e) => {
                if (
                  !dragState.isDragging &&
                  !event.locked &&
                  (e.key === 'Enter' || e.key === ' ')
                ) {
                  e.preventDefault();
                  openModal(event.id, 'all-day');
                }
              }}
              onMouseDown={(e) => handleEventMouseDown(e, eventSpan)}
              onTouchStart={(e) => handleEventTouchStart(e, eventSpan)}
            >
              {/* Cut-off indicator for events that start before visible range */}
              {isCutOffStart && (
                <>
                  <span
                    className="mr-1 opacity-75"
                    aria-hidden="true"
                    title="Event continues from previous days"
                  >
                    ←
                  </span>
                  <span className="sr-only">Continues from previous days</span>
                </>
              )}
              {/* Use shared EventContent component */}
              <EventContent event={event} />
              {/* Cut-off indicator for events that end after visible range */}
              {isCutOffEnd && (
                <>
                  <span
                    className="ml-1 opacity-75"
                    aria-hidden="true"
                    title="Event continues to next days"
                  >
                    →
                  </span>
                  <span className="sr-only">Continues to next days</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Enhanced drag preview with better positioning */}
      {dragState.isDragging &&
        dragState.draggedEvent &&
        (() => {
          const styles = getEventStyles(dragState.draggedEvent.color || 'BLUE');
          return (
            <div
              ref={dragPreviewRef}
              className={cn(
                'pointer-events-none fixed z-50 truncate rounded-sm border-l-2 px-2 py-1 font-semibold shadow-xl',
                'transform backdrop-blur-sm transition-none',
                styles.bg,
                styles.border,
                styles.text,
                'opacity-90'
              )}
              style={{
                left: `${dragState.currentX + 15}px`,
                top: `${dragState.currentY - 20}px`,
                height: `${EVENT_HEIGHT_REM}rem`,
                minWidth: '120px',
                maxWidth: '250px',
                transform: 'rotate(-2deg)',
              }}
            >
              {/* Accessibility: Live region for screen readers */}
              <span className="sr-only" role="status" aria-live="assertive">
                Dragging '{dragState.draggedEvent.title}'
              </span>

              {/* Use shared EventContent component */}
              <EventContent event={dragState.draggedEvent} />
            </div>
          );
        })()}
    </div>
  );
};
