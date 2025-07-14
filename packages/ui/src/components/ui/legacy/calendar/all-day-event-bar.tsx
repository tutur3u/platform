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
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import { MIN_COLUMN_WIDTH, HOUR_HEIGHT } from './config';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { findCalendarElements, createTimedEventFromAllDay } from './calendar-utils';

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

// Export for use in other components (like event modal toggle)


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
  const { settings, openModal, updateEvent, crossZoneDragState, setCrossZoneDragState } = useCalendar();
  const { allDayEvents } = useCalendarSync();
  const { toast } = useToast();
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

  // Auto-scroll functionality for all-day events
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoScrollingRef = useRef(false);
  const scrollDirectionRef = useRef(0);
  const targetSpeedRef = useRef(0);

  const handleAutoScroll = useCallback((clientX: number, clientY: number) => {
    // Find all potential scrollable containers
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) return;
    
    // Enhanced settings for better UX
    const SCROLL_EDGE_SIZE = 100; // Increased edge size for more reliable triggering
    const MAX_SCROLL_SPEED = 30; // Moderate scroll speed
    const MIN_SCROLL_SPEED = 8; // Moderate minimum scroll speed  
    const ACCELERATION = 0.2; // Moderate acceleration factor
    const THROTTLE_DELAY = 16; // 60fps
    
    // Get scrollable element
    const scrollableElements = [];
    let element: HTMLElement | null = calendarView;
    while (element && element !== document.body) {
      const computedStyle = window.getComputedStyle(element);
      const hasVerticalScroll = element.scrollHeight > element.clientHeight;
      const canScroll = computedStyle.overflowY === 'auto' || computedStyle.overflowY === 'scroll';
      
      if (hasVerticalScroll && (canScroll || element === calendarView)) {
        scrollableElements.push(element);
      }
      element = element.parentElement;
    }
    
    const scrollElement = scrollableElements[0] || calendarView;
    const rect = scrollElement.getBoundingClientRect();
    const currentScrollTop = scrollElement.scrollTop;
    const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
    
    // Calculate mouse position relative to scroll container - use VIEWPORT coordinates for stability
    const relativeY = clientY - rect.top;
    const distanceFromTop = Math.max(0, relativeY);
    const distanceFromBottom = Math.max(0, rect.height - relativeY);
    
    // Determine scroll direction and calculate speed based on proximity to edge
    let scrollDirection = 0;
    let targetSpeed = 0;
    
    // Use viewport coordinates for more stable detection
    if (relativeY <= SCROLL_EDGE_SIZE && currentScrollTop > 0) {
      scrollDirection = -1;
      const proximityFactor = 1 - Math.min(1, distanceFromTop / SCROLL_EDGE_SIZE);
      targetSpeed = MIN_SCROLL_SPEED + (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED) * proximityFactor;
    } else if (relativeY >= rect.height - SCROLL_EDGE_SIZE && currentScrollTop < maxScrollTop) {
      scrollDirection = 1;
      const proximityFactor = 1 - Math.min(1, distanceFromBottom / SCROLL_EDGE_SIZE);
      targetSpeed = MIN_SCROLL_SPEED + (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED) * proximityFactor;
    }
    
    // Store scroll parameters in refs
    scrollDirectionRef.current = scrollDirection;
    targetSpeedRef.current = targetSpeed;
    
    // Start auto-scroll if not already running and we have a valid direction
    if (scrollDirection !== 0 && !isAutoScrollingRef.current) {
      isAutoScrollingRef.current = true;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`All-day auto-scroll ${scrollDirection === -1 ? 'UP' : 'DOWN'} started`);
      }
      
      const performScroll = () => {
        // Get fresh scroll element state
        const currentElement = document.getElementById('calendar-view');
        if (!currentElement || !dragState.isDragging) {
          isAutoScrollingRef.current = false;
          scrollDirectionRef.current = 0;
          targetSpeedRef.current = 0;
          return;
        }
        
        const currentScroll = currentElement.scrollTop;
        const maxScroll = currentElement.scrollHeight - currentElement.clientHeight;
        
        // Stop if we've reached scroll limits
        if ((scrollDirectionRef.current === -1 && currentScroll <= 0) ||
            (scrollDirectionRef.current === 1 && currentScroll >= maxScroll)) {
          isAutoScrollingRef.current = false;
          scrollDirectionRef.current = 0;
          targetSpeedRef.current = 0;
          return;
        }
        
        // Perform scroll
        const scrollAmount = scrollDirectionRef.current * MIN_SCROLL_SPEED;
        const newScroll = Math.max(0, Math.min(currentScroll + scrollAmount, maxScroll));
        currentElement.scrollTop = newScroll;
        
        // Continue scrolling
        autoScrollTimerRef.current = setTimeout(performScroll, THROTTLE_DELAY);
      };
      
      performScroll();
    }
    
    // Stop auto-scroll if direction becomes 0
    if (scrollDirection === 0 && isAutoScrollingRef.current) {
      isAutoScrollingRef.current = false;
      scrollDirectionRef.current = 0;
      targetSpeedRef.current = 0;
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    }
  }, [dragState.isDragging]);

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

  // Helper to detect drop zone based on mouse position - IMPROVED for better detection
  const detectDropZone = useCallback((clientY: number) => {
    // Get the calendar container to determine boundaries
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) {
      console.log('DetectDropZone: calendar-view not found, defaulting to all-day');
      return 'all-day';
    }
    
    const calendarRect = calendarView.getBoundingClientRect();
    const allDayContainer = containerRef.current;
    
    if (!allDayContainer) {
      console.log('DetectDropZone: allDayContainer not found, defaulting to all-day');
      return 'all-day';
    }
    
    const allDayRect = allDayContainer.getBoundingClientRect();
    
    // Add some buffer to make detection more reliable
    const DETECTION_BUFFER = 5; // 5px buffer
    
    // If mouse is below the all-day area and within calendar view, it's in timed area
    const isInTimedArea = clientY > (allDayRect.bottom + DETECTION_BUFFER) && 
                         clientY < (calendarRect.bottom - DETECTION_BUFFER);
    
    const result = isInTimedArea ? 'timed' : 'all-day';
    
    // Debug logging for troubleshooting
    if (process.env.NODE_ENV === 'development') {
      console.log('DetectDropZone Debug:', {
        clientY,
        allDayBottom: allDayRect.bottom,
        calendarBottom: calendarRect.bottom,
        isInTimedArea,
        result,
        allDayRect: { top: allDayRect.top, bottom: allDayRect.bottom },
        calendarRect: { top: calendarRect.top, bottom: calendarRect.bottom }
      });
    }
    
    return result;
  }, []);

  // Helper function to calculate visible hour offset from mouse position
  const calculateVisibleHourOffset = useCallback((clientY: number, cellRect: DOMRect, cellHour: number): number => {
    const mouseYFromCellTop = clientY - cellRect.top;
    const mouseHourOffset = mouseYFromCellTop / HOUR_HEIGHT;
    return cellHour + mouseHourOffset;
  }, []);

  // Helper function to calculate target date index from mouse position
  const calculateTargetDateIndex = useCallback((clientX: number, timeTrailRect: DOMRect, calendarViewRect: DOMRect): number => {
    const relativeX = clientX - timeTrailRect.right;
    const columnWidth = calendarViewRect.width / visibleDates.length;
    const dateIndex = Math.floor(relativeX / columnWidth);
    return Math.max(0, Math.min(dateIndex, visibleDates.length - 1));
  }, [visibleDates.length]);

  // Helper function to round time to nearest quarter hour with bounds checking
  const roundToNearestQuarterHour = useCallback((hourFloat: number): { hour: number; minute: number } => {
    const hour = Math.floor(hourFloat);
    const minuteFloat = (hourFloat - hour) * 60;
    const roundedMinute = Math.round(minuteFloat / 15) * 15;
    const finalMinute = roundedMinute === 60 ? 0 : roundedMinute;
    const finalHour = roundedMinute === 60 ? hour + 1 : hour;
    const clampedHour = Math.max(0, Math.min(finalHour, 23));
    const clampedMinute = clampedHour === 23 && finalMinute > 45 ? 45 : finalMinute;
    return { hour: clampedHour, minute: clampedMinute };
  }, []);

  // Helper to calculate time slot target - IMPROVED with better error handling
  const calculateTimeSlotTarget = useCallback((clientX: number, clientY: number) => {
    // Get the calendar view container
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) {
      console.log('CalculateTimeSlotTarget: calendar-view not found');
      return null;
    }
    
    // Find the actual start of the timed calendar grid using robust selectors
    const { timeTrail, calendarView: calendarViewDiv } = findCalendarElements();
    
    if (!timeTrail || !calendarViewDiv) {
      console.log('CalculateTimeSlotTarget: timeTrail or calendarViewDiv not found');
      return null;
    }
    
    // Find any visible calendar cell to understand the actual grid positioning
    const anyVisibleCell = calendarViewDiv.querySelector('.calendar-cell');
    if (!anyVisibleCell) {
      console.log('CalculateTimeSlotTarget: no visible calendar cell found');
      return null;
    }
    
    // Get its hour to understand what's currently visible
    const cellHour = parseInt(anyVisibleCell.getAttribute('data-hour') || '0');
    const cellRect = anyVisibleCell.getBoundingClientRect();
    
    const timeTrailRect = timeTrail.getBoundingClientRect();
    
    // Calculate based on actual visible cell position
    const actualHour = calculateVisibleHourOffset(clientY, cellRect, cellHour);
    const relativeY = actualHour * HOUR_HEIGHT;
    
    // Make sure we're actually in the timed area
    if (relativeY < 0) {
      console.log('CalculateTimeSlotTarget: relativeY < 0, above timed calendar');
      return null; // Above the timed calendar
    }
    
    // Calculate target date from column position  
    const calendarViewRect = calendarViewDiv.getBoundingClientRect();
    const clampedDateIndex = calculateTargetDateIndex(clientX, timeTrailRect, calendarViewRect);
    const targetDate = visibleDates[clampedDateIndex];
    
    if (!targetDate) {
      console.log('CalculateTimeSlotTarget: no target date found for index', clampedDateIndex);
      return null;
    }
    
    // Calculate target time with proper precision using the actual hour height
    const hourFloat = relativeY / HOUR_HEIGHT;
    const { hour: clampedHour, minute: clampedMinute } = roundToNearestQuarterHour(hourFloat);
    
    const result = {
      date: targetDate,
      hour: clampedHour,
      minute: clampedMinute,
    };
    
    // Debug logging for troubleshooting
    if (process.env.NODE_ENV === 'development') {
      console.log('CalculateTimeSlotTarget Success:', {
        clientX,
        clientY,
        cellHour,
        actualHour,
        relativeY,
        hourFloat,
        clampedDateIndex,
        targetDate,
        result
      });
    }
    
    return result;
  }, [visibleDates, calculateVisibleHourOffset, calculateTargetDateIndex, roundToNearestQuarterHour]);

  // Stable drag event handlers using refs
  const handleDragStart = useCallback((e: React.MouseEvent, eventSpan: EventSpan) => {
    // Don't allow dragging locked events
    if (eventSpan.event.locked) return;
    
    // Don't allow dragging if there are no visible dates
    // Allow dragging with single date for cross-zone conversion (all-day to timed)
    if (visibleDates.length === 0) return;
    
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

  // Enhanced drag move handler with seamless cross-zone detection - IMPROVED
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
      
      // Debug logging for troubleshooting conversion issues
      if (process.env.NODE_ENV === 'development') {
        console.log('Drag Move - Timed Zone:', {
          targetZone,
          timeSlotTarget,
          draggedEvent: currentDragState.draggedEvent?.title,
          mousePosition: { x: e.clientX, y: e.clientY }
        });
      }
      
      // Update global cross-zone drag state for preview
      if (currentDragState.draggedEvent && timeSlotTarget) {
        setCrossZoneDragState({
          isActive: true,
          draggedEvent: currentDragState.draggedEvent,
          targetDate: timeSlotTarget.date,
          sourceZone: 'all-day',
          targetZone: 'timed',
          mouseX: e.clientX,
          mouseY: e.clientY,
          targetTimeSlot: {
            hour: timeSlotTarget.hour,
            minute: timeSlotTarget.minute,
          },
        });
      } else {
        // If we're in timed zone but don't have a valid time slot target, clear the cross-zone state
        console.log('Drag Move - Timed Zone but no valid timeSlotTarget, clearing cross-zone state');
        setCrossZoneDragState({
          isActive: false,
          draggedEvent: null,
          targetDate: null,
          sourceZone: null,
          targetZone: null,
          mouseX: 0,
          mouseY: 0,
          targetTimeSlot: null,
        });
      }
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
      
      // Clear cross-zone drag state when in all-day mode
      setCrossZoneDragState({
        isActive: false,
        draggedEvent: null,
        targetDate: null,
        sourceZone: null,
        targetZone: null,
        mouseX: 0,
        mouseY: 0,
        targetTimeSlot: null,
      });
    }

    // Handle auto-scroll for better UX (especially important for mobile and users without scroll wheels)
    handleAutoScroll(e.clientX, e.clientY);

    // Update drag state with new values
    setDragState(prev => ({
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
      targetZone,
      timeSlotTarget,
      previewSpan,
      targetDateIndex: targetZone === 'all-day' ? Math.floor(relativeX / (rect.width / visibleDates.length)) : null,
    }));
  }, [visibleDates.length, detectDropZone, calculateTimeSlotTarget, setCrossZoneDragState]);

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

    // Clear cross-zone drag state
    setCrossZoneDragState({
      isActive: false,
      draggedEvent: null,
      targetDate: null,
      sourceZone: null,
      targetZone: null,
      mouseX: 0,
      mouseY: 0,
      targetTimeSlot: null,
    });

    document.body.style.cursor = '';
    document.body.classList.remove('select-none');

    // Stop auto-scroll
    if (autoScrollTimerRef.current) {
      clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    isAutoScrollingRef.current = false;

    try {
      if (targetZone === 'timed' && currentDragState.timeSlotTarget) {
        // Debug logging for conversion attempt
        console.log('Attempting all-day to timed conversion:', {
          eventId: currentDragState.draggedEvent.id,
          eventTitle: currentDragState.draggedEvent.title,
          targetZone,
          timeSlotTarget: currentDragState.timeSlotTarget,
          tz
        });
        
        // Seamless conversion to timed event
        const { date, hour, minute } = currentDragState.timeSlotTarget;
        const convertedEvent = createTimedEventFromAllDay(
          currentDragState.draggedEvent,
          date,
          hour,
          minute,
          tz,
          true // forceTime: true - user explicitly dragged to this time
        );

        console.log('Converted event data:', {
          original: {
            start_at: currentDragState.draggedEvent.start_at,
            end_at: currentDragState.draggedEvent.end_at
          },
          converted: {
            start_at: convertedEvent.start_at,
            end_at: convertedEvent.end_at,
            scheduling_note: convertedEvent.scheduling_note
          }
        });

        if (typeof updateEvent === 'function') {
          await updateEvent(currentDragState.draggedEvent.id, {
            start_at: convertedEvent.start_at,
            end_at: convertedEvent.end_at,
            scheduling_note: convertedEvent.scheduling_note,
          });
          
          console.log('Successfully updated event to timed');
          
          // Show success toast
          toast({
            title: 'Event Converted',
            description: 'Successfully converted to timed event.',
            variant: 'default',
          });
        }
      } else if (targetZone === 'timed' && !currentDragState.timeSlotTarget) {
        // Debug case where we detected timed zone but no time slot target
        console.error('Conversion failed: targetZone is timed but timeSlotTarget is null', {
          targetZone,
          timeSlotTarget: currentDragState.timeSlotTarget,
          dragState: currentDragState
        });
        
        toast({
          title: 'Conversion Failed',
          description: 'Could not determine target time slot. Please try again.',
          variant: 'destructive',
        });
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
      toast({
        title: targetZone === 'timed' ? 'Conversion to Timed Event Failed' : 'Event Move Failed',
        description: error instanceof Error ? error.message : 'Could not update the event. Please try again.',
        variant: 'destructive',
      });
    }
  }, [visibleDates, tz, updateEvent, setCrossZoneDragState, toast]);

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

  // Add useEffect cleanup for longPressTimer and autoScrollTimer
  React.useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
      }
    };
  }, []);

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

  // Named constants for height calculations
  const MIN_BAR_HEIGHT_REM = 1.9;
  const EVENT_HEIGHT_MULTIPLIER = 1.75;

  // Calculate dynamic height based on visible events (minimum height for drop zone)
  const barHeight = Math.max(MIN_BAR_HEIGHT_REM, eventLayout.maxVisibleEventsPerDay * EVENT_HEIGHT_MULTIPLIER);

  // Enhanced mouse and touch handlers
  const handleEventMouseDown = (e: React.MouseEvent, eventSpan: EventSpan) => {
    if (eventSpan.event.locked) return;
    // Allow dragging even with single date for cross-zone conversion (all-day to timed)
    // Only prevent dragging if there's literally no dates
    if (visibleDates.length === 0) return;
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
    // Allow dragging even with single date for cross-zone conversion (all-day to timed)
    // Only prevent dragging if there's literally no dates
    if (visibleDates.length === 0) return;
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
          'transition-colors duration-200',
          // Enhanced visual feedback for timed-to-all-day conversion
          crossZoneDragState.isActive && crossZoneDragState.sourceZone === 'timed' && crossZoneDragState.targetZone === 'all-day' && 
          'bg-green-50/20 dark:bg-green-900/10 border-green-300/50 dark:border-green-700/50 shadow-inner',
          // Normal drag state within all-day area
          dragState.isDragging && 'bg-blue-50/20 dark:bg-blue-900/10'
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
                
                // Check if we're in cross-zone mode (timed to all-day conversion)
                const isTimedToAllDayConversion = crossZoneDragState.isActive && 
                  crossZoneDragState.sourceZone === 'timed' && 
                  crossZoneDragState.targetZone === 'all-day';

            return (
              <div
                key={`all-day-column-${dateKey}`}
                                  className={cn(
                    "group flex h-full flex-col justify-start border-l last:border-r transition-colors duration-200",
                    // Drop zone visual feedback for internal all-day dragging
                    isDropTarget && !isOriginalColumn && "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700",
                    isOriginalColumn && "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700",
                    // Cross-zone drop target visual feedback (specific column)
                    isCrossZoneDropTarget && "bg-green-50/60 dark:bg-green-900/40 border-green-300/70 dark:border-green-700/70",
                    // General timed-to-all-day conversion visual feedback (entire bar)
                    isTimedToAllDayConversion && !isCrossZoneDropTarget && "bg-green-50/30 dark:bg-green-900/20 border-green-200/40 dark:border-green-800/40",
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


              </div>
            );
          })}
        </div>

        {/* Cross-zone conversion preview - timed to all-day */}
        {crossZoneDragState.isActive && crossZoneDragState.sourceZone === 'timed' && crossZoneDragState.targetZone === 'all-day' && crossZoneDragState.targetDate && (
          <div
            className={cn(
              'absolute rounded-sm border-2 border-dashed transition-all duration-150 z-20',
              'bg-green-100/80 dark:bg-green-900/60 border-green-500 dark:border-green-400',
              'pointer-events-none flex items-center px-2 py-1'
            )}
            style={{
              left: `calc(${(visibleDates.findIndex(date => dayjs(date).isSame(crossZoneDragState.targetDate, 'day')) * 100) / visibleDates.length}% + ${EVENT_LEFT_OFFSET}px)`,
              width: `calc(${100 / visibleDates.length}% - ${EVENT_LEFT_OFFSET * 2}px)`,
              top: '0.25rem',
              height: '1.35rem',
            }}
          >
            <div className="flex items-center gap-1 text-xs font-semibold text-green-800 dark:text-green-200 truncate">
              <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              <span className="truncate">{crossZoneDragState.draggedEvent?.title || 'Event'}</span>
            </div>
          </div>
        )}

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

      {/* Legacy drag preview - only show for all-day to all-day dragging */}
      {dragState.isDragging && dragState.draggedEvent && dragState.targetZone === 'all-day' && (
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
