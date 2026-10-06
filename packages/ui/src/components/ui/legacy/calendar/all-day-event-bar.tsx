import { Calendar, ChevronDown, ChevronUp } from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarClock } from '@tuturuuu/ui/hooks/use-calendar-clock';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { calendarEventStyle } from '@tuturuuu/utils/calendar-event-colors';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  calendarDayBoundary,
  calendarDayKey,
} from '../../../../lib/calendar-day';
import {
  calculateAllDayEventLayout,
  type EventSpan,
  MAX_EVENTS_DISPLAY,
} from './all-day-event-layout';
import { MIN_COLUMN_WIDTH } from './config';
import { CalendarEventProviderIcon } from './event-provider-display';
import { LocationTimeline } from './location-timeline';
import { pastEventTreatment } from './past-event-treatment';
import { useCalendarSettings } from './settings/settings-context';
import { getEventLocationType } from './working-location';

dayjs.extend(timezone);

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
  previewSpan: {
    startIndex: number;
    span: number;
    row: number;
  } | null;
}

const EventContent = ({ event }: { event: CalendarEvent }) => (
  <>
    <CalendarEventProviderIcon
      event={event}
      className="mr-1 h-[1.25em] w-[1.25em] opacity-80 dark:opacity-90"
    />
    <span className="truncate">{event.title}</span>
  </>
);

export const AllDayEventBar = ({ dates }: { dates: Date[] }) => {
  const {
    openModal,
    updateEvent,
    addEvent,
    deleteEvent,
    preservePastEventOpacity,
  } = useCalendar();
  const { allDayEvents } = useCalendarSync();
  const now = useCalendarClock();
  const { settings } = useCalendarSettings();
  const showWeekends = settings.appearance.showWeekends;
  const tz = settings?.timezone?.timezone;
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

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

  const dragStateRef = useRef<DragState>(dragState);
  dragStateRef.current = dragState;

  const containerRef = useRef<HTMLDivElement>(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragInitiated = useRef(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const DRAG_THRESHOLD = 5; // px
  const LONG_PRESS_DURATION = 250; // ms

  const EVENT_LEFT_OFFSET = 4; // 4px offset from left edge
  /** Height of the LocationTimeline strip in rem. Used to offset regular events when location events are present. */
  const LOCATION_TIMELINE_HEIGHT_REM = 1.5;

  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day = date.getDay();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  const handleDragStart = useCallback(
    (e: React.MouseEvent, eventSpan: EventSpan) => {
      if (visibleDates.length <= 1 || eventSpan.event.seriesId) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

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

      document.body.style.cursor = 'grabbing';
      document.body.classList.add('select-none');
    },
    [visibleDates.length]
  );

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

      const columnWidth = rect.width / visibleDates.length;
      const targetDateIndex = Math.floor(relativeX / columnWidth);
      const clampedTargetIndex = Math.max(
        0,
        Math.min(targetDateIndex, visibleDates.length - 1)
      );

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

    if (originalDateIndex < 0 || originalDateIndex >= visibleDates.length) {
      console.warn('Invalid original date index for drag operation');
      return;
    }

    const getDayjsDate = (d: string | Date) =>
      tz === 'auto' ? dayjs(d) : dayjs(d).tz(tz);

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

    if (targetDateIndex === null || targetDateIndex === originalDateIndex) {
      return;
    }

    try {
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

  const eventLayout = useMemo(
    () =>
      calculateAllDayEventLayout(allDayEvents, visibleDates, tz, expandedDates),
    [allDayEvents, visibleDates, tz, expandedDates]
  );

  const locationSpans = useMemo(() => {
    const allLocationSpans = eventLayout.locationSpansFromMerge || [];

    const claimedDays = new Set<number>();
    const deduplicatedSpans: EventSpan[] = [];

    const sortedSpans = [...allLocationSpans].sort(
      (a, b) => a.startIndex - b.startIndex
    );

    for (const span of sortedSpans) {
      let hasConflict = false;
      for (let day = span.startIndex; day <= span.endIndex; day++) {
        if (claimedDays.has(day)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        for (let day = span.startIndex; day <= span.endIndex; day++) {
          claimedDays.add(day);
        }
        deduplicatedSpans.push(span);
      }
    }

    return deduplicatedSpans;
  }, [eventLayout.locationSpansFromMerge]);

  const regularSpans = useMemo(() => {
    return eventLayout.spans.filter(
      (span) => getEventLocationType(span.event) === null
    );
  }, [eventLayout.spans]);

  const getUniqueEventsForDate = (dateIndex: number): EventSpan[] => {
    return eventLayout.eventsByDay[dateIndex] ?? [];
  };

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

  const locationTopOffset =
    locationSpans.length > 0 ? LOCATION_TIMELINE_HEIGHT_REM : 0;
  const regularRowsHeight =
    eventLayout.maxVisibleEventsPerDay > 0
      ? eventLayout.maxVisibleEventsPerDay * 1.75
      : 0;
  const barHeight = Math.max(1.9, locationTopOffset + regularRowsHeight);

  const handleEventMouseDown = (e: React.MouseEvent, eventSpan: EventSpan) => {
    if (visibleDates.length <= 1 || eventSpan.event.seriesId) return;
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
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!dragInitiated.current) {
        openModal(eventSpan.event.id, 'all-day');
      }
      dragStartPos.current = null;
      dragInitiated.current = false;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleEventTouchStart = (e: React.TouchEvent, eventSpan: EventSpan) => {
    if (visibleDates.length <= 1 || eventSpan.event.seriesId) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    dragInitiated.current = false;
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
            const dateKey = calendarDayKey(date);

            const dateEvents = getUniqueEventsForDate(dateIndex);
            const shouldShowAll = dateEvents.length === MAX_EVENTS_DISPLAY + 1;
            const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
            const hiddenCount =
              !isExpanded && !shouldShowAll
                ? Math.max(0, dateEvents.length - MAX_EVENTS_DISPLAY)
                : 0;

            const isDropTarget =
              dragState.isDragging && dragState.targetDateIndex === dateIndex;
            const isOriginalColumn =
              dragState.isDragging && dragState.originalDateIndex === dateIndex;

            return (
              <div
                key={`all-day-column-${dateKey}`}
                className={cn(
                  'group flex h-full flex-col justify-start border-l transition-colors duration-200 last:border-r',
                  isDropTarget &&
                    !isOriginalColumn &&
                    'border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30',
                  isOriginalColumn &&
                    'border-red-300 bg-red-100 dark:border-red-700 dark:bg-red-900/30',
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
                      top: `${locationTopOffset + MAX_EVENTS_DISPLAY * 1.7}rem`,
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
                        top: `${locationTopOffset + dateEvents.length * 1.7}rem`,
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

        <LocationTimeline
          visibleDates={visibleDates}
          locationSpans={locationSpans}
          tz={tz}
          addEvent={addEvent}
          updateEvent={updateEvent}
          openModal={openModal}
          deleteEvent={deleteEvent}
        />

        {regularSpans.map((eventSpan) => {
          const { event, startIndex, span, row, isCutOffStart, isCutOffEnd } =
            eventSpan;

          const eventStyle = calendarEventStyle(event);
          const eventRow = row;

          const shouldHideEvent = visibleDates.some((date, dateIndex) => {
            if (dateIndex < startIndex || dateIndex > startIndex + span - 1)
              return false;

            const dateKey = calendarDayKey(date);

            const dateEvents = getUniqueEventsForDate(dateIndex);
            const shouldShowAll = dateEvents.length === MAX_EVENTS_DISPLAY + 1;
            const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
            const visibleCount = isExpanded
              ? dateEvents.length
              : Math.min(dateEvents.length, MAX_EVENTS_DISPLAY);

            return eventRow >= visibleCount;
          });

          if (shouldHideEvent) return null;

          const isDraggedEvent =
            dragState.isDragging && dragState.draggedEvent?.id === event.id;

          const topOffset = locationTopOffset;
          const optimisticStatus = (
            event as CalendarEvent & {
              _optimisticStatus?:
                | 'creating'
                | 'updating'
                | 'deleting'
                | 'error';
            }
          )._optimisticStatus;
          const isPendingMutation =
            optimisticStatus === 'updating' || optimisticStatus === 'deleting';

          return (
            <div
              key={`spanning-event-${event.id}`}
              className={cn(
                'absolute flex items-center rounded-sm border-l-2 px-2 py-1 font-semibold text-xs transition-all duration-200',
                pastEventTreatment(
                  event,
                  preservePastEventOpacity,
                  isDraggedEvent,
                  now.getTime(),
                  calendarDayBoundary(
                    eventSpan.actualEndDate.toDate(),
                    tz
                  ).getTime()
                ),
                dragState.isDragging
                  ? 'cursor-grabbing'
                  : 'cursor-grab hover:cursor-grab',
                isDraggedEvent && 'scale-95 outline outline-dashed',
                isPendingMutation &&
                  'outline outline-dashed outline-1 outline-primary',
                (isCutOffStart || isCutOffEnd) && 'border-dashed'
              )}
              style={{
                ...eventStyle,
                borderColor: eventStyle.color,
                left: `calc(${(startIndex * 100) / visibleDates.length}% + ${EVENT_LEFT_OFFSET}px)`,
                width: `calc(${(span * 100) / visibleDates.length}% - ${EVENT_LEFT_OFFSET * 2}px)`,
                top: `${eventRow * 1.6 + 0.25 + topOffset}rem`,
                height: '1.35rem',
                zIndex: isDraggedEvent ? 10 : 5,
              }}
              onClick={() => {
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
            getEventStyles(dragState.draggedEvent.color || 'BLUE').text
          )}
          style={{
            ...calendarEventStyle(dragState.draggedEvent),
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
