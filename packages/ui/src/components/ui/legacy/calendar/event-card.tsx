import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Edit,
  Lock,
  Palette,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../../context-menu';
import { GRID_SNAP, HOUR_HEIGHT, MAX_HOURS, MIN_EVENT_HEIGHT } from './config';
import { TIME_TRAIL_WIDTH } from './calendar-utils';

dayjs.extend(timezone);

// Utility function to round time to nearest 15-minute interval
const roundToNearest15Minutes = (date: Date): Date => {
  const minutes = date.getMinutes();
  const remainder = minutes % 15;
  const roundedMinutes =
    remainder < 8 ? minutes - remainder : minutes + (15 - remainder);
  const roundedDate = new Date(date);
  roundedDate.setMinutes(roundedMinutes);
  roundedDate.setSeconds(0);
  roundedDate.setMilliseconds(0);
  return roundedDate;
};

interface EventCardProps {
  dates: Date[];
  wsId: string;
  event: CalendarEvent;
  level?: number; // Level for stacking events
}

import { createAllDayEventFromTimed } from './calendar-utils';

// Cache refresh interval (refresh every 100ms during drag to handle resize)
const CACHE_REFRESH_MS = 100;



export function EventCard({ dates, event, level = 0 }: EventCardProps) {
  const {
    id,
    title,
    description,
    // start_at,
    end_at,
    color = 'BLUE',
    locked = false,
    _isMultiDay,
    _dayPosition,
    _overlapCount,
    _overlapGroup,
  } = event;

  // Default values for overlap properties if not provided
  const overlapCount = _overlapCount || 1;
  const overlapGroup = _overlapGroup || [id];
  
  const { updateEvent, hideModal, openModal, deleteEvent, settings, setCrossZoneDragState } =
    useCalendar();
  const tz = settings?.timezone?.timezone;

  // Local state for immediate UI updates
  const [localEvent, setLocalEvent] = useState<CalendarEvent>(event);

  // Parse dates properly using selected time zone - memoized to prevent infinite loops
  const startDate = useMemo(() => {
    return tz === 'auto'
      ? dayjs(localEvent.start_at)
      : dayjs(localEvent.start_at).tz(tz);
  }, [localEvent.start_at, tz]);
  
  const endDate = useMemo(() => {
    return tz === 'auto' 
      ? dayjs(localEvent.end_at) 
      : dayjs(localEvent.end_at).tz(tz);
  }, [localEvent.end_at, tz]);

  // Calculate hours with decimal minutes for positioning - memoized
  const startHours = useMemo(() => {
    return Math.min(
      MAX_HOURS - 0.01,
      startDate.hour() + startDate.minute() / 60
    );
  }, [startDate]);

  const endHours = useMemo(() => {
    return Math.min(MAX_HOURS, endDate.hour() + endDate.minute() / 60);
  }, [endDate]);

  // Calculate duration, handling overnight events correctly - memoized
  const duration = useMemo(() => {
    return endHours <= startHours && !_isMultiDay
      ? MAX_HOURS - startHours + endHours
      : endHours - startHours;
  }, [endHours, startHours, _isMultiDay]);

  // Calculate duration in minutes
  // const durationMs = (dayjs(endDate).valueOf() - dayjs(startDate).valueOf());
  // const durationMinutes = Math.round(durationMs / (1000 * 60));

  // Refs for DOM elements
  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Refs for tracking interaction state without re-renders
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const wasDraggedRef = useRef(false);
  const wasResizedRef = useRef(false);
  const initialPositionRef = useRef({ x: 0, y: 0 });
  const currentPositionRef = useRef({ top: 0, left: 0 });
  const syncPendingRef = useRef(false);

  // Performance optimization: Cache DOM elements and calculations
  const cachedElements = useRef<{
    allDayContainer: HTMLElement | null;
    calendarView: HTMLElement | null;
    allDayRect: DOMRect | null;
    calendarRect: DOMRect | null;
    lastCacheTime: number;
  }>({
    allDayContainer: null,
    calendarView: null,
    allDayRect: null,
    calendarRect: null,
    lastCacheTime: 0,
  });

  // Performance optimization: Cache expensive calculations
  const calculationCache = useRef<{
    lastPosition: { top: number; left: number };
    lastTimeData: { start_at: string; end_at: string };
    lastCrossZoneCheck: { clientY: number; result: boolean; timestamp: number };
    lastTargetDateCheck: { clientX: number; result: Date | null; timestamp: number };
  }>({
    lastPosition: { top: -1, left: -1 },
    lastTimeData: { start_at: '', end_at: '' },
    lastCrossZoneCheck: { clientY: -1, result: false, timestamp: 0 },
    lastTargetDateCheck: { clientX: -1, result: null, timestamp: 0 },
  });

  // Throttle expensive state updates
  const lastStateUpdateRef = useRef(0);
  const STATE_UPDATE_THROTTLE_MS = 16; // ~60fps

  // Enhanced auto-scroll functionality based on proven techniques
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoScrollingRef = useRef(false);
  const scrollVelocityRef = useRef(0);
  const scrollDirectionRef = useRef(0);
  const targetSpeedRef = useRef(0);

  const handleAutoScroll = useCallback((clientX: number, clientY: number) => {
    // Find all potential scrollable containers
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) return;
    
    // Enhanced settings for better UX
    const SCROLL_EDGE_SIZE = 200; // Increased edge size for more reliable triggering
    const MAX_SCROLL_SPEED = 10; // Moderate scroll speed
    const MIN_SCROLL_SPEED = 4; // Moderate minimum scroll speed  
    const ACCELERATION = 0.1; // Moderate acceleration factor
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
    let indicatorDirection: 'up' | 'down' | null = null;
    let targetSpeed = 0;
    
    // Use viewport coordinates for more stable detection
    if (relativeY <= SCROLL_EDGE_SIZE && currentScrollTop > 0) {
      scrollDirection = -1;
      indicatorDirection = 'up';
      const proximityFactor = 1 - Math.min(1, distanceFromTop / SCROLL_EDGE_SIZE);
      targetSpeed = MIN_SCROLL_SPEED + (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED) * proximityFactor;
    } else if (relativeY >= rect.height - SCROLL_EDGE_SIZE && currentScrollTop < maxScrollTop) {
      scrollDirection = 1;
      indicatorDirection = 'down';
      const proximityFactor = 1 - Math.min(1, distanceFromBottom / SCROLL_EDGE_SIZE);
      targetSpeed = MIN_SCROLL_SPEED + (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED) * proximityFactor;
    }
    
    // Show/hide scroll indicators - update position continuously
    if (scrollDirection !== 0) {
      setScrollIndicator({
        show: true,
        direction: indicatorDirection,
        position: { x: clientX, y: clientY },
      });
    } else {
      setScrollIndicator({
        show: false,
        direction: null,
        position: { x: 0, y: 0 },
      });
    }
    
    // Store scroll parameters in refs
    scrollDirectionRef.current = scrollDirection;
    targetSpeedRef.current = targetSpeed;
    
    // Start auto-scroll if not already running and we have a valid direction
    if (scrollDirection !== 0 && !isAutoScrollingRef.current) {
      isAutoScrollingRef.current = true;
      scrollVelocityRef.current = MIN_SCROLL_SPEED;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`Auto-scroll ${scrollDirection === -1 ? 'UP' : 'DOWN'} started`);
      }
      
      const performScroll = () => {
        // Get fresh scroll element state
        const currentElement = document.getElementById('calendar-view');
        if (!currentElement || !isDraggingRef.current) {
          isAutoScrollingRef.current = false;
          scrollVelocityRef.current = 0;
          scrollDirectionRef.current = 0;
          targetSpeedRef.current = 0;
          setScrollIndicator({ show: false, direction: null, position: { x: 0, y: 0 } });
          return;
        }
        
        const currentScroll = currentElement.scrollTop;
        const maxScroll = currentElement.scrollHeight - currentElement.clientHeight;
        
        // Stop if we've reached scroll limits
        if ((scrollDirectionRef.current === -1 && currentScroll <= 0) ||
            (scrollDirectionRef.current === 1 && currentScroll >= maxScroll)) {
          isAutoScrollingRef.current = false;
          scrollVelocityRef.current = 0;
          scrollDirectionRef.current = 0;
          targetSpeedRef.current = 0;
          setScrollIndicator({ show: false, direction: null, position: { x: 0, y: 0 } });
          return;
        }
        
        // Accelerate smoothly
        if (scrollVelocityRef.current < targetSpeedRef.current) {
          scrollVelocityRef.current = Math.min(
            targetSpeedRef.current, 
            scrollVelocityRef.current + targetSpeedRef.current * ACCELERATION
          );
        }
        
        // Perform scroll
        const scrollAmount = scrollDirectionRef.current * scrollVelocityRef.current;
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
      scrollVelocityRef.current = 0;
      scrollDirectionRef.current = 0;
      targetSpeedRef.current = 0;
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
      setScrollIndicator({ show: false, direction: null, position: { x: 0, y: 0 } });
    }
  }, []);

  // Optimized all-day drop zone detection with caching - PRECISE zone detection only
  const detectAllDayDropZoneOptimized = (clientY: number): boolean => {
    const now = Date.now();
    
    // Refresh cache if stale or not initialized
    if (!cachedElements.current.allDayContainer || now - cachedElements.current.lastCacheTime > CACHE_REFRESH_MS) {
      // Be very specific about finding the actual all-day container
      // Only use the official data-testid, don't fall back to generic selectors
      cachedElements.current.allDayContainer = document.querySelector('[data-testid="all-day-container"]');
      
      if (cachedElements.current.allDayContainer) {
        cachedElements.current.allDayRect = cachedElements.current.allDayContainer.getBoundingClientRect();
      } else {
        // If we can't find the all-day container, don't enable all-day conversion
        cachedElements.current.allDayRect = null;
      }
      cachedElements.current.lastCacheTime = now;
    }
    
    // If no all-day container found, never convert to all-day
    if (!cachedElements.current.allDayRect) {
      if (process.env.NODE_ENV === 'development') {
        console.log('detectAllDayDropZoneOptimized: No all-day container found');
      }
      return false;
    }
    
    // PRECISE DETECTION: Only trigger when EXACTLY within the all-day bar bounds
    // Add small buffer to prevent edge cases, but don't allow triggering way above or below
    const PRECISION_BUFFER = 5; // Small 5px buffer for edge precision
    const isInZone = clientY >= (cachedElements.current.allDayRect.top - PRECISION_BUFFER) && 
                     clientY <= (cachedElements.current.allDayRect.bottom + PRECISION_BUFFER);
    
    // Debug logging (throttled)
    if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
      console.log('detectAllDayDropZoneOptimized:', {
        clientY,
        allDayRect: {
          top: cachedElements.current.allDayRect.top,
          bottom: cachedElements.current.allDayRect.bottom,
          topWithBuffer: cachedElements.current.allDayRect.top - PRECISION_BUFFER,
          bottomWithBuffer: cachedElements.current.allDayRect.bottom + PRECISION_BUFFER
        },
        isInZone,
        aboveZone: clientY < (cachedElements.current.allDayRect.top - PRECISION_BUFFER),
        belowZone: clientY > (cachedElements.current.allDayRect.bottom + PRECISION_BUFFER)
      });
    }
    
    return isInZone;
  };

  // Optimized target date calculation with caching - IMPROVED for precision
  const calculateAllDayTargetOptimized = (clientX: number, dates: Date[]): Date | null => {
    const now = Date.now();
    
    // First, try to get the all-day container for more accurate calculation
    if (!cachedElements.current.allDayContainer || now - cachedElements.current.lastCacheTime > CACHE_REFRESH_MS) {
      cachedElements.current.allDayContainer = document.querySelector('[data-testid="all-day-container"]');
      
      if (cachedElements.current.allDayContainer) {
        cachedElements.current.allDayRect = cachedElements.current.allDayContainer.getBoundingClientRect();
      }
      
      // Also try to find the calendar view container as fallback
      cachedElements.current.calendarView = document.getElementById('calendar-view') ||
                                            document.querySelector('[data-testid="calendar-view"]') ||
                                            document.querySelector('.calendar-view');
      
      if (cachedElements.current.calendarView) {
        cachedElements.current.calendarRect = cachedElements.current.calendarView.getBoundingClientRect();
      }
      
      cachedElements.current.lastCacheTime = now;
    }
    
    // Use all-day container if available, otherwise fallback to calendar view
    const targetRect = cachedElements.current.allDayRect || cachedElements.current.calendarRect;
    if (!targetRect) {
      console.log('calculateAllDayTargetOptimized: No target rect available');
      return null;
    }
    
    // Calculate relative position within the target area
    // For all-day container, we don't need time trail offset since it doesn't include it
    // For calendar view, we need to account for time trail offset
    const isUsingAllDayContainer = !!cachedElements.current.allDayRect;
    const TIME_TRAIL_OFFSET = isUsingAllDayContainer ? 0 : 64; // Only offset for calendar view
    
    const relativeX = clientX - targetRect.left - TIME_TRAIL_OFFSET;
    const availableWidth = targetRect.width - TIME_TRAIL_OFFSET;
    const columnWidth = availableWidth / dates.length;
    
    // Calculate which date column the mouse is over
    const dateIndex = Math.floor(relativeX / columnWidth);
    const clampedDateIndex = Math.max(0, Math.min(dateIndex, dates.length - 1));
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('calculateAllDayTargetOptimized:', {
        clientX,
        targetRect: { left: targetRect.left, width: targetRect.width },
        isUsingAllDayContainer,
        TIME_TRAIL_OFFSET,
        relativeX,
        availableWidth,
        columnWidth,
        dateIndex,
        clampedDateIndex,
        datesLength: dates.length,
        targetDate: dates[clampedDateIndex]
      });
    }
    
    // Return the target date, ensuring it's valid
    return dates[clampedDateIndex] || null;
  };

  // Visual states that trigger renders
  const [isHovering, setIsHovering] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'syncing' | 'success' | 'error'
  >('idle');
  const [visualState, setVisualState] = useState({
    isDragging: false,
    isResizing: false,
  });

  // Status feedback timeout
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show temporary status feedback
  const showStatusFeedback = (status: 'success' | 'error') => {
    setUpdateStatus(status);

    // Clear any existing timeout
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }

    // Reset status after a short delay, regardless of pending updates
    // This ensures status indicators don't stay visible indefinitely
    statusTimeoutRef.current = setTimeout(() => {
      // For success status, always clear after a short delay
      if (status === 'success') {
        setUpdateStatus('idle');
        statusTimeoutRef.current = null;
      } else if (status === 'error') {
        // For errors, we might want to keep them visible a bit longer
        // but still clear them eventually
        setTimeout(() => {
          setUpdateStatus('idle');
        }, 3000);
        statusTimeoutRef.current = null;
      }
    }, 1500);
  };

  // Batch visual state updates to reduce renders
  const updateVisualState = (updates: Partial<typeof visualState>) => {
    setVisualState((prev) => ({ ...prev, ...updates }));
  };

  // Debounced update function to reduce API calls
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdateRef = useRef<{
    start_at: string;
    end_at: string;
  } | null>(null);

  // Schedule a throttled update
  // Throttled schedule update to reduce React re-renders
  const lastScheduleUpdateRef = useRef(0);
  const SCHEDULE_UPDATE_THROTTLE_MS = 50; // Max 20 updates per second

  const scheduleUpdate = (updateData: { start_at: string; end_at: string }) => {
    // For multi-day events, we need to update the original event
    const eventId = event._originalId || id;

    // Store the latest update data
    pendingUpdateRef.current = updateData;
    syncPendingRef.current = true;

    // Throttle React state updates to reduce re-renders during drag
    const now = Date.now();
    if (now - lastScheduleUpdateRef.current > SCHEDULE_UPDATE_THROTTLE_MS) {
      // Batch all state updates together to prevent multiple re-renders
      setLocalEvent((prev) => ({
        ...prev,
        ...updateData,
      }));
      setIsSyncing(true);
      setUpdateStatus('syncing');
      lastScheduleUpdateRef.current = now;
    } else {
      // Still update local event data even when throttling UI updates
      setLocalEvent((prev) => ({
        ...prev,
        ...updateData,
      }));
    }

    // Only start a new timer if there isn't one already
    if (!updateTimeoutRef.current) {
      updateTimeoutRef.current = setTimeout(() => {
        if (pendingUpdateRef.current) {
          updateEvent(eventId, pendingUpdateRef.current)
            .then(() => {
              showStatusFeedback('success');
            })
            .catch((error) => {
              console.error('Failed to update event:', error);
              showStatusFeedback('error');

              // Don't revert to original data on error to prevent infinite loops
              // The user can manually refresh if needed
            })
            .finally(() => {
              syncPendingRef.current = false;
              setTimeout(() => {
                if (!syncPendingRef.current) {
                  setIsSyncing(false);
                }
              }, 300);
            });

          pendingUpdateRef.current = null;
        }

        updateTimeoutRef.current = null;
      }, 250); // Throttle to once every 250ms
    }
  };

  // Clean up any pending updates
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
      }
    };
  }, []);

  // Keep local state in sync with prop changes - fixed to prevent infinite loops
  useEffect(() => {
    // Only update if we're not in the middle of a drag/resize operation
    // Don't depend on isSyncing to prevent infinite loops
    // Add defensive check to ensure event has required properties
    if (!isDraggingRef.current && !isResizingRef.current && !syncPendingRef.current && 
        event && event.start_at && event.end_at) {
      // Only update if the event data actually changed to prevent unnecessary re-renders
      if (localEvent.start_at !== event.start_at || localEvent.end_at !== event.end_at || 
          localEvent.title !== event.title || localEvent.color !== event.color) {
        setLocalEvent(event);
      }
    }
  }, [event, localEvent.start_at, localEvent.end_at, localEvent.title, localEvent.color]); // Removed isSyncing dependency to break infinite loop

  // Initial event positioning
  useEffect(() => {
    const cardEl = document.getElementById(`event-${id}`);
    const cellEl = document.querySelector('.calendar-cell') as HTMLDivElement;

    if (!cardEl || !cellEl) return;

    // Calculate event height based on duration
    let height = Math.max(MIN_EVENT_HEIGHT, duration * HOUR_HEIGHT);

    // For multi-day events, adjust the height and position
    if (_isMultiDay) {
      if (_dayPosition === 'start') {
        // First day - start at the event's start time, end at midnight
        height = Math.max(
          MIN_EVENT_HEIGHT,
          (MAX_HOURS - startHours) * HOUR_HEIGHT
        );
      } else if (_dayPosition === 'end') {
        // Last day - start at midnight, end at the event's end time
        height = Math.max(MIN_EVENT_HEIGHT, endHours * HOUR_HEIGHT);
      } else {
        // Middle days - full day from midnight to midnight
        height = MAX_HOURS * HOUR_HEIGHT;
      }
    }

    // Ensure height doesn't exceed the day's bounds
    height = Math.min(
      height,
      MAX_HOURS * HOUR_HEIGHT - startHours * HOUR_HEIGHT
    );

    // Calculate the index of the day the event is in
    const dateIdx = dates.findIndex((date) => {
      const eventDate = startDate;
      return (
        date.getFullYear() === eventDate.year() &&
        date.getMonth() === eventDate.month() &&
        date.getDate() === eventDate.date()
      );
    });

    if (dateIdx === -1) {
      cardEl.style.opacity = '0';
      cardEl.style.pointerEvents = 'none';
      return;
    }

    // Update event dimensions and position
    cardEl.style.height = `${height - 4}px`;

    // Position based on start time
    if (_isMultiDay && _dayPosition !== 'start') {
      // For middle and end segments, start at the top of the day
      cardEl.style.top = '0px';
    } else {
      // Ensure startHours doesn't exceed 24 hours
      const clampedStartHours = Math.min(startHours, MAX_HOURS - 0.01);
      cardEl.style.top = `${clampedStartHours * HOUR_HEIGHT}px`;
    }

    const updatePosition = () => {
      if (!cardEl || !cellEl) return;

      const columnWidth = cellEl.offsetWidth;

      // Calculate event index within its overlap group
      // const overlapIndex = overlapGroup.indexOf(id);

      // If this event has overlaps, distribute width among overlapping events
      const hasOverlaps = overlapCount > 1;

      // Width calculation based on overlap count
      let eventWidth: number, eventLeft: number;

      if (hasOverlaps) {
        // Calculate the position of this event within its overlap group
        // Sort the overlap group by ID to ensure consistent ordering
        const sortedGroup = [...overlapGroup].sort();
        const positionIndex = sortedGroup.indexOf(id);

        // Split width calculation - give each event an equal portion of the column
        // Use a small gap between events for visual separation
        const gap = 2;
        const totalGap = gap * (overlapCount - 1);
        const availableWidth = columnWidth - totalGap;
        const singleWidth = availableWidth / overlapCount;

        // Calculate width and position
        eventWidth = singleWidth;
        eventLeft = dateIdx * columnWidth + positionIndex * (singleWidth + gap);
      } else {
        // No overlaps - use full width (with small margin)
        eventWidth = columnWidth - 8;
        eventLeft = dateIdx * (columnWidth + 2); // 4px margin on each side
      }

      cardEl.style.width = `${eventWidth}px`;
      cardEl.style.left = `${eventLeft}px`;

      // All events at same z-index for level ordering
      cardEl.style.zIndex = '10';

      // Store the initial position
      currentPositionRef.current = {
        top: parseInt(cardEl.style.top, 10),
        left: parseInt(cardEl.style.left, 10),
      };
    };

    // Set initial position
    updatePosition();

    // Track resize for responsive layout
    const observer = new ResizeObserver(() => {
      // Debounce position updates to prevent excessive calls
      if (!isDraggingRef.current && !isResizingRef.current) {
        requestAnimationFrame(updatePosition);
      }
    });

    observer.observe(cellEl);

    // Check if the event is in the past
    const isPastEvent = endDate.isBefore(dayjs());

    // Set opacity based on whether the event is in the past
    cardEl.style.opacity = isPastEvent ? '0.5' : '1';
    cardEl.style.pointerEvents = 'all';

    return () => observer.disconnect();
  }, [
    id,
    localEvent.start_at,    // Use primitive string instead of derived startDate
    localEvent.end_at,      // Use primitive string instead of derived endDate  
    level,
    dates,
    _isMultiDay,
    _dayPosition,
    overlapCount,
    overlapGroup,
    tz,                     // Add tz dependency since it affects calculations
  ]);

  // Event resizing - only enable for non-multi-day events or the start/end segments
  useEffect(() => {
    // Disable resizing for middle segments of multi-day events or locked events
    if ((_isMultiDay && _dayPosition === 'middle') || locked) return;

    const handleEl = handleRef.current;
    const eventCardEl = document.getElementById(`event-${id}`);
    if (!handleEl || !eventCardEl) return;

    let startY = 0;
    let startHeight = 0;
    let hasMoved = false;

    const handleMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Don't allow interaction with locked events or during sync
      if (locked || isSyncing) return;

      // Don't allow multiple operations
      if (isDraggingRef.current || isResizingRef.current) return;

      startY = e.clientY;
      startHeight = eventCardEl.offsetHeight;
      isResizingRef.current = true;
      wasResizedRef.current = false;
      hasMoved = false;

      // Update visual state
      updateVisualState({ isResizing: true });
      setUpdateStatus('idle'); // Reset any previous status

      // Prevent interaction with other events
      hideModal();

      // Change cursor for better UX
      document.body.style.cursor = 'ns-resize';
      document.body.classList.add('select-none');

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();

        if (!isResizingRef.current) return;

        // Calculate height change
        const dy = e.clientY - startY;

        // Only process if there's significant movement
        if (!hasMoved && Math.abs(dy) < 5) return;

        hasMoved = true;
        wasResizedRef.current = true;

        // Snap to grid
        const newHeight = Math.max(
          MIN_EVENT_HEIGHT,
          Math.round((startHeight + dy) / GRID_SNAP) * GRID_SNAP
        );

        // Update height with a maximum limit
        const maxHeight = _isMultiDay
          ? _dayPosition === 'start'
            ? (MAX_HOURS - startHours) * HOUR_HEIGHT
            : MAX_HOURS * HOUR_HEIGHT
          : MAX_HOURS * HOUR_HEIGHT;

        const constrainedHeight = Math.min(newHeight, maxHeight);
        eventCardEl.style.height = `${constrainedHeight}px`;

        // Calculate new end time
        let newEndAt: dayjs.Dayjs;

        if (_isMultiDay) {
          if (_dayPosition === 'start') {
            // For start segment, we're adjusting the end time of the first day
            newEndAt = startDate.clone();
            // Calculate hours directly from pixels for better precision
            const newEndHours = constrainedHeight / HOUR_HEIGHT + startHours;
            const newEndHour = Math.min(23, Math.floor(newEndHours));
            const newEndMinute = Math.round(
              (newEndHours - Math.floor(newEndHours)) * 60
            );
            newEndAt = newEndAt
              .hour(newEndHour)
              .minute(newEndMinute)
              .second(0)
              .millisecond(0);
            // Snap to 15-minute intervals
            newEndAt = dayjs(roundToNearest15Minutes(newEndAt.toDate()));
          } else if (_dayPosition === 'end') {
            // For end segment, we're adjusting the end time of the last day
            newEndAt = endDate.clone();
            const newDuration = constrainedHeight / HOUR_HEIGHT;
            const newEndHour = Math.min(23, Math.floor(newDuration));
            const newEndMinute = Math.round(
              (newDuration - Math.floor(newDuration)) * 60
            );
            newEndAt = newEndAt
              .hour(newEndHour)
              .minute(newEndMinute)
              .second(0)
              .millisecond(0);
            // Snap to 15-minute intervals
            newEndAt = dayjs(roundToNearest15Minutes(newEndAt.toDate()));
          } else {
            return; // Should not happen
          }
        } else {
          // Regular event
          const newDuration = constrainedHeight / HOUR_HEIGHT; // Convert pixels to hours
          // Calculate end time directly from start time + duration
          newEndAt = startDate.clone().add(newDuration, 'hour');
          // Snap to 15-minute intervals
          newEndAt = dayjs(roundToNearest15Minutes(newEndAt.toDate()));
          // Ensure end time doesn't wrap to the next day
          if (newEndAt.isBefore(startDate)) {
            newEndAt = newEndAt.add(1, 'day');
          }
        }

        // After calculating the rounded end time, adjust the visual height to match
        const durationInHours =
          (dayjs(newEndAt).valueOf() - startDate.valueOf()) / (1000 * 60 * 60);
        const adjustedHeight = durationInHours * HOUR_HEIGHT;
        eventCardEl.style.height = `${Math.max(MIN_EVENT_HEIGHT, adjustedHeight)}px`;

        // Schedule the update with safeguard
        if (!syncPendingRef.current) {
          scheduleUpdate({
            start_at: startDate.toISOString(),
            end_at: newEndAt.toISOString(),
          });
        }

        // Explicitly set local event end time for immediate UI update
        setLocalEvent((prev) => ({
          ...prev,
          end_at: newEndAt.toISOString(),
        }));
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        updateVisualState({ isResizing: false });

        // Restore cursor
        document.body.style.cursor = '';
        document.body.classList.remove('select-none');

        // Set resize flag
        wasResizedRef.current = hasMoved;

        // Send a final update if needed
        if (pendingUpdateRef.current) {
          setUpdateStatus('syncing'); // Start syncing animation immediately
          updateEvent(event._originalId || id, pendingUpdateRef.current)
            .then(() => {
              showStatusFeedback('success');
            })
            .catch((error) => {
              console.error('Failed to update event:', error);
              showStatusFeedback('error');
            });
          pendingUpdateRef.current = null;
        }

        // Clean up
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
    };

    handleEl.addEventListener('mousedown', handleMouseDown);
    return () => handleEl.removeEventListener('mousedown', handleMouseDown);
  }, [
    id,
    startDate,
    updateEvent,
    hideModal,
    _isMultiDay,
    _dayPosition,
    event,
    startHours,
    locked,
  ]);

  // Enhanced drag state for seamless cross-zone support
  const [crossZoneDrag, setCrossZoneDrag] = useState<{
    isInAllDayZone: boolean;
    targetDate: Date | null;
  }>({
    isInAllDayZone: false,
    targetDate: null,
  });

  // Auto-scroll indicator state
  const [scrollIndicator, setScrollIndicator] = useState<{
    show: boolean;
    direction: 'up' | 'down' | null;
    position: { x: number; y: number };
  }>({
    show: false,
    direction: null,
    position: { x: 0, y: 0 },
  });

  // Ref to store current localEvent value for stable access in handlers
  const localEventRef = useRef<CalendarEvent>(localEvent);
  localEventRef.current = localEvent;

  // Ref to store current crossZoneDrag state for stable access in handlers
  const crossZoneDragRef = useRef(crossZoneDrag);
  crossZoneDragRef.current = crossZoneDrag;

  // Event dragging - enhanced with seamless cross-zone support
  useEffect(() => {
    // Disable dragging for multi-day events or locked events
    if (_isMultiDay || locked) return;

    const contentEl = contentRef.current;
    const eventCardEl = document.getElementById(`event-${id}`);
    const cellEl = document.querySelector('.calendar-cell') as HTMLDivElement;

    // Use calendar view container instead of specific cell for width calculation
    const calendarContainer = document.getElementById('calendar-view') || 
                              document.getElementById('calendar-event-matrix') ||
                              cellEl;

    if (!contentEl || !eventCardEl || !calendarContainer) return;

    let startX = 0;
    let startY = 0;
    let initialCardPosition = { top: 0, left: 0 };
    let columnWidth = 0;
    let hasMoved = false;

    const handleMouseDown = (e: MouseEvent) => {
      // Debug logging (minimal)
      if (process.env.NODE_ENV === 'development' && e.button !== 0) {
        console.log('Non-primary button clicked on event:', id);
      }
      
      // Only handle primary mouse button (left click)
      if (e.button !== 0) {
        return;
      }

      // Don't allow interaction with locked events or during sync
      if (locked || isSyncing) {
        return;
      }

      e.stopPropagation();

      // Don't allow multiple operations
      if (isResizingRef.current || isDraggingRef.current) {
        return;
      }

      // Record initial positions
      startX = e.clientX;
      startY = e.clientY;

      // Record initial card position
      initialCardPosition = {
        top: eventCardEl.offsetTop,
        left: eventCardEl.offsetLeft,
      };

      // Update cached dimensions
      columnWidth = calendarContainer.offsetWidth / dates.length;

      // Reset tracking state
      hasMoved = false;
      wasDraggedRef.current = false;
      initialPositionRef.current = { x: e.clientX, y: e.clientY };
      currentPositionRef.current = initialCardPosition;
      isDraggingRef.current = true;

      // Reset cross-zone drag state
      setCrossZoneDrag({
        isInAllDayZone: false,
        targetDate: null,
      });

      // Update visual state for immediate feedback
      updateVisualState({ isDragging: true });
      setUpdateStatus('idle'); // Reset any previous status

      // Prevent interaction with other events
      hideModal();

      // Apply drag styling
      document.body.style.cursor = 'grabbing';
      document.body.classList.add('select-none');

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();

        if (isResizingRef.current) return;
        
        // Debug logging (throttled) - commented out to reduce noise
        // if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
        //   console.log('Mouse move during drag:', {
        //     eventId: id,
        //     clientX: e.clientX,
        //     clientY: e.clientY,
        //     hasMoved
        //   });
        // }

        // Calculate delta movement
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Only start dragging if moved beyond threshold
        if (!hasMoved) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

          // Start drag mode
          isDraggingRef.current = true;
          wasDraggedRef.current = true;
          hasMoved = true;

          // Debug logging (reduced)
          if (process.env.NODE_ENV === 'development') {
            console.log('Drag initiated for event:', id);
          }

          // Update visual state
          updateVisualState({ isDragging: true });

          // Other UI adjustments
          hideModal();
          document.body.classList.add('select-none');
        }

        // Handle auto-scroll FIRST for better UX - this should work regardless of zone
        if (isDraggingRef.current) {
          handleAutoScroll(e.clientX, e.clientY);
        }

        // Optimized cross-zone detection with caching
        const now = Date.now();
        let isInAllDayZone: boolean;
        let targetDate: Date | null = null;

        // Cache cross-zone check (within 5px and 10ms for performance)
        if (Math.abs(e.clientY - calculationCache.current.lastCrossZoneCheck.clientY) < 5 && 
            now - calculationCache.current.lastCrossZoneCheck.timestamp < 10) {
          isInAllDayZone = calculationCache.current.lastCrossZoneCheck.result;
        } else {
          isInAllDayZone = detectAllDayDropZoneOptimized(e.clientY);
          calculationCache.current.lastCrossZoneCheck = {
            clientY: e.clientY,
            result: isInAllDayZone,
            timestamp: now
          };
        }
        
        // Calculate target date only if in all-day zone and cache it
        if (isInAllDayZone) {
          if (Math.abs(e.clientX - calculationCache.current.lastTargetDateCheck.clientX) < 5 && 
              now - calculationCache.current.lastTargetDateCheck.timestamp < 50) {
            targetDate = calculationCache.current.lastTargetDateCheck.result;
          } else {
            targetDate = calculateAllDayTargetOptimized(e.clientX, dates);
            calculationCache.current.lastTargetDateCheck = {
              clientX: e.clientX,
              result: targetDate,
              timestamp: now
            };
            
            // Debug logging for target date calculation
            if (process.env.NODE_ENV === 'development') {
              console.log('Timed event drag - target date calculated:', {
                clientX: e.clientX,
                targetDate,
                isInAllDayZone
              });
            }
          }
        }

        // Update cross-zone state more responsively
        const crossZoneStateChanged = 
          crossZoneDrag.isInAllDayZone !== isInAllDayZone || 
          crossZoneDrag.targetDate !== targetDate;

        if (crossZoneStateChanged) {
          setCrossZoneDrag({ isInAllDayZone, targetDate });
          
          // Debug logging for local cross-zone state change (throttled)
          if (process.env.NODE_ENV === 'development' && Math.random() < 0.01) {
            console.log('Local cross-zone state updated:', {
              isInAllDayZone,
              targetDate,
              changed: crossZoneStateChanged
            });
          }
        }

        if (isInAllDayZone) {
          // Update global cross-zone drag state for visual feedback (more responsive throttling)
          if (now - lastStateUpdateRef.current > 30 || !crossZoneDrag.isInAllDayZone) { // 30ms throttle, or immediately if entering zone
            setCrossZoneDragState({
              isActive: true,
              draggedEvent: localEvent,
              targetDate,
              sourceZone: 'timed',
              targetZone: 'all-day',
              mouseX: e.clientX,
              mouseY: e.clientY,
              targetTimeSlot: null, // Not needed for all-day conversion
            });
            lastStateUpdateRef.current = now;
            
            // Debug logging for cross-zone state update (throttled)
            if (process.env.NODE_ENV === 'development' && Math.random() < 0.02) {
              console.log('Cross-zone drag state updated - IN all-day zone:', {
                isActive: true,
                targetDate,
                sourceZone: 'timed',
                targetZone: 'all-day',
                mousePosition: { x: e.clientX, y: e.clientY }
              });
            }
          }
          
          // Hide the original event completely during cross-zone drag (preview shows in all-day bar)
          eventCardEl.style.opacity = '0';
          eventCardEl.style.visibility = 'hidden'; // Completely hide from rendering
          eventCardEl.style.cursor = 'grabbing';
          
          // Still maintain the static reference during all-day preview
          let staticReference = document.getElementById(`static-ref-${id}`);
          if (!staticReference) {
            staticReference = eventCardEl.cloneNode(true) as HTMLElement;
            staticReference.id = `static-ref-${id}`;
            staticReference.style.position = 'absolute';
            staticReference.style.top = `${initialCardPosition.top}px`;
            staticReference.style.left = `${initialCardPosition.left}px`;
            staticReference.style.width = `${eventCardEl.offsetWidth}px`;
            staticReference.style.height = `${eventCardEl.offsetHeight}px`;
            staticReference.style.opacity = '0.4';
            staticReference.style.pointerEvents = 'none';
            staticReference.style.cursor = 'default';
            staticReference.style.border = '2px dashed rgba(59, 130, 246, 0.5)';
            staticReference.style.zIndex = '1';
            staticReference.style.transform = 'none';
            
            // Insert the static reference before the original in the DOM
            eventCardEl.parentElement?.insertBefore(staticReference, eventCardEl);
          }
          
          return; // Don't do normal positioning when in all-day zone
        } else {
          // CRITICAL: Always clear global state when not in all-day zone
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
          
          // CRITICAL: Also clear the local cross-zone state immediately
          setCrossZoneDrag({
            isInAllDayZone: false,
            targetDate: null,
          });
          
                // Debug logging for cross-zone state clearing (throttled)
      if (process.env.NODE_ENV === 'development' && Math.random() < 0.05) {
        console.log('Cross-zone drag state cleared - NOT in all-day zone:', {
          clientY: e.clientY,
          wasInAllDayZone: crossZoneDrag.isInAllDayZone,
          clearingBothStates: true
        });
      }
          
          // Reset for normal dragging when moving out of all-day zone
          eventCardEl.style.opacity = '0.7'; // Keep it slightly transparent during normal drag
          eventCardEl.style.visibility = 'visible'; // Restore visibility
          eventCardEl.style.cursor = 'grabbing';
          eventCardEl.style.pointerEvents = 'none';
          eventCardEl.style.transform = ''; // Reset any scaling applied during cross-zone drag
          
          // IMPORTANT: Continue with normal timed event positioning logic below
          // Don't return here so the normal drag positioning can work
        }

        // Normal timed event dragging logic
        // Snap to grid - ensure we move in whole units
        const snapToGrid = (value: number, gridSize: number) => {
          return Math.round(value / gridSize) * gridSize;
        };

        // Calculate new position with snapping
        const newTop = snapToGrid(initialCardPosition.top + dy, GRID_SNAP);
        const newLeft = snapToGrid(initialCardPosition.left + dx, columnWidth);
        
        // Calculate target date index early for use in snap indicator
        const newDateIdx = Math.floor(newLeft / columnWidth);

        // Constrain vertical position to stay within the day (0-24h)
        const constrainedTop = Math.max(
          0,
          Math.min(newTop, MAX_HOURS * HOUR_HEIGHT - MIN_EVENT_HEIGHT)
        );

        // Keep track of the current position to avoid redundant updates
        const positionChanged =
          constrainedTop !== currentPositionRef.current.top ||
          newLeft !== currentPositionRef.current.left;

        if (positionChanged) {
          // Create static reference shadow at original position (only once)
          let staticReference = document.getElementById(`static-ref-${id}`);
          if (!staticReference) {
            staticReference = eventCardEl.cloneNode(true) as HTMLElement;
            staticReference.id = `static-ref-${id}`;
            staticReference.style.position = 'absolute';
            staticReference.style.top = `${initialCardPosition.top}px`;
            staticReference.style.left = `${initialCardPosition.left}px`;
            staticReference.style.width = `${eventCardEl.offsetWidth}px`;
            staticReference.style.height = `${eventCardEl.offsetHeight}px`;
            staticReference.style.opacity = '0.4';
            staticReference.style.pointerEvents = 'none';
            staticReference.style.cursor = 'default';
            staticReference.style.border = '2px dashed rgba(59, 130, 246, 0.5)';
            staticReference.style.zIndex = '1';
            staticReference.style.transform = 'none';
            
            // Insert the static reference before the original in the DOM
            eventCardEl.parentElement?.insertBefore(staticReference, eventCardEl);
          }
          
          // Keep the original event visible but slightly transparent during drag
          eventCardEl.style.opacity = '0.7';
          eventCardEl.style.pointerEvents = 'none';

          // Store the current position for data calculation
          currentPositionRef.current = { top: constrainedTop, left: newLeft };

          // Optimize: Only recalculate times if position actually changed significantly
          const positionDelta = Math.abs(constrainedTop - calculationCache.current.lastPosition.top) + 
                               Math.abs(newLeft - calculationCache.current.lastPosition.left);

          if (positionDelta > 5) { // Only recalculate if moved more than 5px
            // Calculate new times based on position
            const newStartHour = constrainedTop / HOUR_HEIGHT;
            const newStartHourFloor = Math.floor(newStartHour);
            const newStartMinute = Math.round((newStartHour - newStartHourFloor) * 60);

            const newStartAt = startDate.toDate();
            newStartAt.setHours(newStartHourFloor);
            newStartAt.setMinutes(newStartMinute);

            // Snap start time to 15-minute intervals
            const roundedStartAt = roundToNearest15Minutes(newStartAt);

            // Update date if moved to different day
            if (newDateIdx >= 0 && newDateIdx < dates.length) {
              const newDate = dates[newDateIdx];
              if (newDate) {
                roundedStartAt.setFullYear(newDate.getFullYear());
                roundedStartAt.setMonth(newDate.getMonth());
                roundedStartAt.setDate(newDate.getDate());
              }
            }

            // Calculate new end time maintaining original duration
            const newEndAt = dayjs(roundedStartAt)
              .add(endDate.valueOf() - startDate.valueOf(), 'millisecond')
              .toDate();

            const newTimeData = {
              start_at: roundedStartAt.toISOString(),
              end_at: newEndAt.toISOString(),
            };

            // Only update if times actually changed
            if (newTimeData.start_at !== calculationCache.current.lastTimeData.start_at || 
                newTimeData.end_at !== calculationCache.current.lastTimeData.end_at) {
              calculationCache.current.lastTimeData = newTimeData;
              calculationCache.current.lastPosition = { top: constrainedTop, left: newLeft };
              
              // Schedule update with additional safeguard
              if (!syncPendingRef.current || now - lastScheduleUpdateRef.current > SCHEDULE_UPDATE_THROTTLE_MS) {
                scheduleUpdate(newTimeData);
              }
            }
          }
        }
      };

      const handleMouseUp = async (e: MouseEvent) => {
        
        if (hasMoved) {
          // Get current zone status at the time of mouse up (most accurate)
          const currentlyInAllDayZone = detectAllDayDropZoneOptimized(e.clientY);
          const currentTargetDate = currentlyInAllDayZone ? calculateAllDayTargetOptimized(e.clientX, dates) : null;
          
          // Debug logging for mouse up decision
          if (process.env.NODE_ENV === 'development') {
            console.log('Mouse up - conversion decision:', {
              currentlyInAllDayZone,
              currentTargetDate,
              refState: {
                isInAllDayZone: crossZoneDragRef.current.isInAllDayZone,
                targetDate: crossZoneDragRef.current.targetDate
              },
              mousePosition: { x: e.clientX, y: e.clientY }
            });
          }
          
          // Seamless cross-zone conversion - use current state, not ref state
          if (currentlyInAllDayZone && currentTargetDate) {
                          try {
                // Convert timed event to all-day event
                const convertedEvent = createAllDayEventFromTimed(
                  localEventRef.current,
                  currentTargetDate as Date
                );

              // Update the event in the database
              await updateEvent(event._originalId || id, {
                start_at: convertedEvent.start_at,
                end_at: convertedEvent.end_at,
                scheduling_note: convertedEvent.scheduling_note,
              });

              // Clean up static reference after successful conversion
              const staticReference = document.getElementById(`static-ref-${id}`);
              if (staticReference) staticReference.remove();

              // Show success feedback
              setUpdateStatus('success');
              showStatusFeedback('success');
                          } catch (error) {
                console.error('Failed to convert to all-day event:', {
                  error,
                  eventId: event._originalId || id,
                  targetDate: currentTargetDate,
                  originalEvent: localEventRef.current
                });
              setUpdateStatus('error');
              showStatusFeedback('error');
              
              // Clean up static reference on error too
              const staticReference = document.getElementById(`static-ref-${id}`);
              if (staticReference) staticReference.remove();
              
              // Revert visual changes
              eventCardEl.style.opacity = '1';
              eventCardEl.style.visibility = 'visible';
              eventCardEl.style.transform = ''; // Reset any cross-zone transforms
              eventCardEl.style.pointerEvents = 'auto';
              eventCardEl.style.cursor = '';
              eventCardEl.style.border = '';
              eventCardEl.style.zIndex = '10';
            }
          } else if (currentlyInAllDayZone && !currentTargetDate) {
            // Revert visual changes and cleanup
            eventCardEl.style.opacity = '1';
            eventCardEl.style.transform = '';
            eventCardEl.style.pointerEvents = 'auto';
            eventCardEl.style.cursor = '';
            eventCardEl.style.border = '';
            eventCardEl.style.zIndex = '10';
            
            // Clean up static reference
            const staticReference = document.getElementById(`static-ref-${id}`);
            if (staticReference) staticReference.remove();
          } else {
            // Normal timed event drag completion
            // Reset drag state
            isDraggingRef.current = false;
            updateVisualState({ isDragging: false });
            document.body.classList.remove('select-none');
            document.body.style.cursor = '';

            // Set flag to indicate this was a drag operation
            wasDraggedRef.current = true;

            // Clean up static reference
            const staticReference = document.getElementById(`static-ref-${id}`);
            if (staticReference) staticReference.remove();

            // Restore original event and update position
            if (eventCardEl) {
              // Restore original event appearance
              eventCardEl.style.opacity = '1';
              eventCardEl.style.visibility = 'visible';
              eventCardEl.style.pointerEvents = 'auto';
              eventCardEl.style.cursor = '';
              eventCardEl.style.border = '';
              eventCardEl.style.zIndex = '10';
              eventCardEl.style.transform = ''; // Reset any transforms from cross-zone dragging
              
              const currentTop = currentPositionRef.current.top;
              const currentLeft = currentPositionRef.current.left;

              // Set final position
              eventCardEl.style.top = `${currentTop}px`;
              eventCardEl.style.left = `${currentLeft}px`;

              // Ensure final update is sent
              if (pendingUpdateRef.current) {
                setUpdateStatus('syncing'); // Start syncing animation immediately
                updateEvent(event._originalId || id, pendingUpdateRef.current)
                  .then(() => {
                    showStatusFeedback('success');
                  })
                  .catch((error: unknown) => {
                    console.error('Failed to update event:', error);
                    showStatusFeedback('error');
                  });
                pendingUpdateRef.current = null;
              }
            }
          }
        } else {
          // Reset state if no actual drag occurred
          isDraggingRef.current = false;
          updateVisualState({ isDragging: false });
          document.body.classList.remove('select-none');
          document.body.style.cursor = '';

          // Clean up static reference
          const staticReference = document.getElementById(`static-ref-${id}`);
          if (staticReference) staticReference.remove();
          
          // Restore original event to fully interactive state
          if (eventCardEl) {
            eventCardEl.style.opacity = '1';
            eventCardEl.style.visibility = 'visible';
            eventCardEl.style.pointerEvents = 'auto';
            eventCardEl.style.border = '';
            eventCardEl.style.cursor = ''; 
            eventCardEl.style.zIndex = '10';
            eventCardEl.style.transform = ''; // Reset any cross-zone transforms
          }

          // Check if this was just a click (no significant movement)
          const deltaX = Math.abs(e.clientX - initialPositionRef.current.x);
          const deltaY = Math.abs(e.clientY - initialPositionRef.current.y);

          if (deltaX < 5 && deltaY < 5) {
            openModal(event._originalId || id);
          }
        }

        // Final cleanup: Reset all drag-related states
        isDraggingRef.current = false;
        updateVisualState({ isDragging: false });
        document.body.classList.remove('select-none');
        document.body.style.cursor = '';

        // Stop auto-scroll and hide indicators
        if (autoScrollTimerRef.current) {
          clearTimeout(autoScrollTimerRef.current);
          autoScrollTimerRef.current = null;
        }
        isAutoScrollingRef.current = false;
        setScrollIndicator({ show: false, direction: null, position: { x: 0, y: 0 } });

        // Reset cross-zone drag state
        setCrossZoneDrag({
          isInAllDayZone: false,
          targetDate: null,
        });
        
        // Clear global cross-zone drag state
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

        // Final static reference cleanup (safety net)
        const staticReference = document.getElementById(`static-ref-${id}`);
        if (staticReference) staticReference.remove();

        // Performance cleanup: Clear caches after drag
        calculationCache.current = {
          lastPosition: { top: -1, left: -1 },
          lastTimeData: { start_at: '', end_at: '' },
          lastCrossZoneCheck: { clientY: -1, result: false, timestamp: 0 },
          lastTargetDateCheck: { clientX: -1, result: null, timestamp: 0 },
        };
        cachedElements.current.lastCacheTime = 0; // Force DOM cache refresh on next drag

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
    };

    // Debug logging for event listener setup (reduced to only show issues)
    if (process.env.NODE_ENV === 'development' && (!contentEl || !eventCardEl || !calendarContainer)) {
      console.warn('Missing elements for drag setup:', {
        eventId: id,
        contentEl: !!contentEl,
        eventCardEl: !!eventCardEl,
        calendarContainer: !!calendarContainer,
        _isMultiDay,
        locked
      });
    }
    
    contentEl.addEventListener('mousedown', handleMouseDown);
    return () => {
      // Removed debug logging to reduce console noise
      contentEl.removeEventListener('mousedown', handleMouseDown);
    };
  }, [id, startDate, endDate, dates, updateEvent, hideModal, openModal, _isMultiDay, event, locked]);

  // Color styles based on event color

  const { bg, border, text, dragBg, syncingBg, successBg, errorBg } =
    getEventStyles(color);

  // Get the appropriate background based on event state
  const getBackgroundStyle = () => {
    if (updateStatus === 'syncing') return syncingBg;
    if (updateStatus === 'success') return successBg;
    if (updateStatus === 'error') return errorBg;
    if (visualState.isDragging) return dragBg;
    return bg;
  };

  // Use the visual state for UI rendering
  const { isDragging, isResizing } = visualState;

  // Determine if we should show continuation indicators for multi-day events
  const showStartIndicator = _isMultiDay && _dayPosition !== 'start';
  const showEndIndicator = _isMultiDay && _dayPosition !== 'end';

  // Format time for display
  const formatEventTime = (date: Date | dayjs.Dayjs) => {
    const timeFormat = settings.appearance.timeFormat;
    const d = dayjs.isDayjs(date)
      ? date
      : tz === 'auto'
        ? dayjs(date)
        : dayjs(date).tz(tz);
    return d.format(timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
  };

  // Check if the event is in the past
  const isPastEvent = new Date(end_at) < new Date();

  // Handle color change
  const handleColorChange = (newColor: SupportedColor) => {
    const eventId = event._originalId || id;
    updateEvent(eventId, { color: newColor })
      .then(() => {
        showStatusFeedback('success');
      })
      .catch((error) => {
        console.error('Failed to update event color:', error);
        showStatusFeedback('error');
      });
  };

  // Handle delete
  const handleDelete = () => {
    const eventId = event._originalId || id;
    deleteEvent(eventId).catch((error) => {
      console.error('Failed to delete event:', error);
    });
  };

  // Handle lock/unlock
  const handleLockToggle = () => {
    const eventId = event._originalId || id;
    const newLockedState = !locked;

    console.log(
      `Toggling lock status for event ${eventId} from ${locked} to ${newLockedState}`
    );

    updateEvent(eventId, { locked: newLockedState })
      .then(() => {
        console.log(`Successfully updated lock status to ${newLockedState}`);
        // Update local state immediately for better UX
        setLocalEvent((prev) => ({
          ...prev,
          locked: newLockedState,
        }));
        showStatusFeedback('success');
      })
      .catch((error) => {
        console.error('Failed to update event lock status:', error);
        showStatusFeedback('error');
      });
  };

  return (
    <>
      {/* Auto-scroll visual indicators */}
      {scrollIndicator.show && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${scrollIndicator.position.x + 20}px`,
            top: `${scrollIndicator.position.y - (scrollIndicator.direction === 'up' ? 40 : -10)}px`,
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/90 text-white text-sm font-medium rounded-lg shadow-lg backdrop-blur-sm animate-pulse">
            {scrollIndicator.direction === 'up' ? (
              <>
                <svg className="w-4 h-4 animate-bounce" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                <span>Scroll up</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 animate-bounce" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span>Scroll down</span>
              </>
            )}
          </div>
        </div>
      )}
      
      <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={cardRef}
          id={`event-${id}`}
          className={cn(
            'pointer-events-auto absolute max-w-none overflow-hidden rounded-l rounded-r-md border-l-2 transition-colors duration-300 select-none',
            'group transition-all hover:ring-1 focus:outline-none',
            {
              'transform shadow-md': isDragging || isResizing, // Subtle transform during interaction
              'opacity-50': isPastEvent, // Lower opacity for past events
              'rounded-l-none border-l-4': showStartIndicator, // Special styling for continuation from previous day
              'rounded-r-none border-r-4': showEndIndicator, // Special styling for continuation to next day
              // Seamless visual feedback for cross-zone dragging
              'opacity-60 scale-90': crossZoneDrag.isInAllDayZone,
            },
            border,
            text,
            getBackgroundStyle() // Use dynamic background based on status
          )}
          style={{
            transition:
              isDragging || isResizing
                ? 'none' // No transition during interaction
                : 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', // Smoother transition
            zIndex: isHovering || isDragging || isResizing ? 50 : 10 - level, // Use level for z-index
            willChange:
              isDragging || isResizing ? 'transform, top, left' : 'auto', // GPU acceleration
            transform: isDragging || isResizing ? 'translateZ(0)' : 'none', // Force GPU acceleration during interaction
            cursor: isSyncing ? 'wait' : 'pointer', // Show wait cursor during sync
          }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          tabIndex={0}
          onClick={(e) => {
            // Only open modal if we haven't just finished dragging or resizing and not syncing
            if (!wasDraggedRef.current && !wasResizedRef.current && !isSyncing) {
              e.stopPropagation();
              // Open the modal with the event, it will be read-only if locked
              openModal(event._originalId || id);
            }

            // Reset state flags
            wasDraggedRef.current = false;
            wasResizedRef.current = false;
          }}
          role="button"
          aria-label={`Event: ${title || 'Untitled event'}`}
        >
          {/* Continuation indicators for multi-day events */}
          {showStartIndicator && (
            <div className="absolute top-1/2 left-2 -translate-x-1 -translate-y-1/2">
              <ArrowLeft className={`h-3 w-3 ${text}`} />
            </div>
          )}

          {showEndIndicator && (
            <div className="absolute top-1/2 right-2 translate-x-1 -translate-y-1/2">
              <ArrowRight className={`h-3 w-3 ${text}`} />
            </div>
          )}

          {/* Edit button overlay */}
          <div
            className={cn(
              'absolute top-2 right-2 rounded-full p-0.5 opacity-0 shadow-sm',
              'z-10 transition-opacity group-hover:opacity-100', // Higher z-index
              {
                'opacity-0!':
                  isDragging || isResizing || updateStatus !== 'idle',
              } // Hide during interaction or status updates
            )}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openModal(event._originalId || id);
            }}
          >
            <Pencil className="h-3 w-3" />
          </div>

          {/* Status indicators */}
          {updateStatus === 'syncing' && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/5">
              {/* <div
                className="animate-shimmer h-full w-full bg-linear-to-r from-transparent via-background/10 to-transparent"
                style={{ backgroundSize: '200% 100%' }}
              /> */}
              <div className="absolute top-2 right-2 rounded-full bg-background/30 p-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
              </div>
            </div>
          )}

          {updateStatus === 'success' && (
            <div className="pointer-events-none absolute top-2 right-2 z-20">
              <Check className="h-3 w-3 text-dynamic-light-green" />
            </div>
          )}

          {updateStatus === 'error' && (
            <div className="pointer-events-none absolute top-2 right-2 z-20">
              <AlertTriangle className="h-3 w-3 text-dynamic-light-red" />
            </div>
          )}

          <div
            ref={contentRef}
            className={cn(
              'flex h-full flex-col text-left select-none',
              duration <= 0.25 ? 'px-1 py-0' : 'p-1',
              duration <= 0.5 ? 'text-xs' : 'text-sm',
              _isMultiDay && 'items-start'
            )}
          >
            <div
              className={cn(
                'w-full flex-1',
                _isMultiDay && _dayPosition !== 'start' && 'pl-3'
              )}
            >
              <div
                className={cn(
                  'space-x-1 text-xs font-semibold',
                  duration <= 0.5 ? 'line-clamp-1' : 'line-clamp-2'
                )}
              >
                {locked && (
                  <Lock
                    className="mt-0.5 inline-block h-3 w-3 shrink-0 -translate-y-0.5 opacity-70"
                    aria-label="Event locked"
                  />
                )}
                {typeof localEvent.google_event_id === 'string' &&
                  localEvent.google_event_id.trim() !== '' && (
                    <img
                      src="/media/google-calendar-icon.png"
                      alt="Google Calendar"
                      className="mr-1 inline-block h-4 w-4 align-text-bottom"
                      title="Synced from Google Calendar"
                      data-testid="google-calendar-logo"
                    />
                  )}
                <span className="min-w-0 overflow-hidden text-ellipsis">
                  {localEvent.title || 'Untitled event'}
                </span>
              </div>

              {/* Show time for regular events or start/end segments of multi-day events */}
              {((!_isMultiDay && duration > 0.5) ||
                (_isMultiDay &&
                  (_dayPosition === 'start' || _dayPosition === 'end'))) && (
                <div className="mt-1 flex items-center text-xs opacity-80">
                  {_isMultiDay ? (
                    _dayPosition === 'start' ? (
                      <span>Starts {formatEventTime(startDate)}</span>
                    ) : (
                      <span>Ends {formatEventTime(endDate)}</span>
                    )
                  ) : (
                    <span>
                      {formatEventTime(startDate)} - {formatEventTime(endDate)}
                    </span>
                  )}
                </div>
              )}

              {/* Show description if there's enough space */}
              {(duration > 1 || _isMultiDay) && description && (
                <div className="mt-1 line-clamp-2 text-xs opacity-80">
                  {description}
                </div>
              )}
            </div>
          </div>

          {/* Only show resize handle for non-multi-day events or start/end segments */}
          {(!_isMultiDay || _dayPosition !== 'middle') && (
            <div
              ref={handleRef}
              className={cn(
                'absolute inset-x-0 bottom-0 cursor-s-resize hover:bg-primary/20',
                'h-2 transition-colors'
              )}
              aria-label="Resize event"
            />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          onClick={() => openModal(event._originalId || id)}
          className={cn('flex items-center gap-2', {
            'cursor-not-allowed opacity-50': locked || isSyncing,
          })}
          disabled={locked || isSyncing}
        >
          <Edit className="h-4 w-4" />
          <span>{locked ? 'View Event' : isSyncing ? 'Syncing...' : 'Edit Event'}</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={handleLockToggle}
          className={cn('flex items-center gap-2', {
            'cursor-not-allowed opacity-50': isSyncing,
          })}
          disabled={isSyncing}
        >
          {locked ? (
            <>
              <Unlock className="h-4 w-4" />
              <span>Unlock Event</span>
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              <span>Lock Event</span>
            </>
          )}
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger
            className={cn('flex items-center gap-2', {
              'cursor-not-allowed opacity-50': locked || isSyncing,
            })}
            disabled={locked || isSyncing}
          >
            <Palette className="h-4 w-4" />
            <span className="text-foreground">Change Color</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="grid w-56 grid-cols-2 gap-1 p-2">
            <ContextMenuItem
              onClick={() => handleColorChange('RED')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-red/80 bg-calendar-bg-red"></div>
              <span>Red</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('BLUE')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-blue/80 bg-calendar-bg-blue"></div>
              <span>Blue</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('GREEN')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-green/80 bg-calendar-bg-green"></div>
              <span>Green</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('YELLOW')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-yellow/80 bg-calendar-bg-yellow"></div>
              <span>Yellow</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('PURPLE')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-purple/80 bg-calendar-bg-purple"></div>
              <span>Purple</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('PINK')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-pink/80 bg-calendar-bg-pink"></div>
              <span>Pink</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('ORANGE')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-orange/80 bg-calendar-bg-orange"></div>
              <span>Orange</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('INDIGO')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-indigo/80 bg-calendar-bg-indigo"></div>
              <span>Indigo</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('CYAN')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-cyan/80 bg-calendar-bg-cyan"></div>
              <span>Cyan</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleColorChange('GRAY')}
              className="flex items-center gap-2"
            >
              <div className="h-4 w-4 flex-none rounded-full border border-dynamic-light-gray/80 bg-calendar-bg-gray"></div>
              <span>Gray</span>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={handleDelete}
          className={cn('flex items-center gap-2', {
            'cursor-not-allowed opacity-50': locked || isSyncing,
          })}
          disabled={locked || isSyncing}
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete Event</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    </>
  );
}
