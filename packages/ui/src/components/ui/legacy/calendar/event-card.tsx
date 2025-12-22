import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Edit,
  Eye,
  Lock,
  Palette,
  Pencil,
  RefreshCw,
  Repeat,
  Trash2,
  Unlock,
} from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import { containsHtml, sanitizeHtml } from '@tuturuuu/utils/html-sanitizer';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useCalendarSettings } from './settings/settings-context';

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
    _column,
    google_calendar_id,
    _calendarName,
    _calendarColor,
    // Habit flags (from CalendarEventWithHabitInfo)
    _isHabit,
    _habitCompleted,
    // Preview flags (from preview mode)
    _isPreview,
    _isReused,
    _previewType,
    _warning,
  } = event as CalendarEvent & {
    _isHabit?: boolean;
    _habitCompleted?: boolean;
    _isPreview?: boolean;
    _isReused?: boolean;
    _previewType?: 'habit' | 'task';
    _warning?: string;
  };

  // Default values for overlap properties if not provided
  const overlapCount = _overlapCount || 1;
  const overlapGroup = _overlapGroup || [id];
  const columnIndex = _column ?? 0;

  const {
    updateEvent,
    hideModal,
    openModal,
    deleteEvent,
    hoveredBaseEventId,
    setHoveredBaseEventId,
    hoveredEventColumn,
    setHoveredEventColumn,
    affectedEventIds,
  } = useCalendar();

  // NOTE: Event filtering for hideNonPreviewEvents is handled in CalendarEventMatrix
  // This ensures proper elevation calculation. We no longer hide events here.
  const { settings } = useCalendarSettings();
  const queryClient = useQueryClient();
  const tz = settings?.timezone?.timezone;

  // Local state for immediate UI updates
  const [localEvent, setLocalEvent] = useState<CalendarEvent>(event);

  // Parse dates properly using selected time zone
  const startDate =
    tz === 'auto'
      ? dayjs(localEvent.start_at)
      : dayjs(localEvent.start_at).tz(tz);
  const endDate =
    tz === 'auto' ? dayjs(localEvent.end_at) : dayjs(localEvent.end_at).tz(tz);

  // Calculate hours with decimal minutes for positioning
  const startHours = Math.min(
    MAX_HOURS - 0.01,
    startDate.hour() + startDate.minute() / 60
  );

  const endHours = Math.min(MAX_HOURS, endDate.hour() + endDate.minute() / 60);

  // Calculate duration, handling overnight events correctly
  const duration =
    endHours <= startHours && !_isMultiDay
      ? MAX_HOURS - startHours + endHours
      : endHours - startHours;

  // Calculate duration in minutes
  // const durationMs = (dayjs(endDate).valueOf() - dayjs(startDate).valueOf());
  // const durationMinutes = Math.round(durationMs / (1000 * 60));

  // Refs for DOM elements
  const cardRef = useRef<HTMLButtonElement>(null);
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
  const showStatusFeedback = useCallback((status: 'success' | 'error') => {
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
  }, []);

  // Batch visual state updates to reduce renders
  const updateVisualState = useCallback(
    (updates: Partial<typeof visualState>) => {
      setVisualState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // Debounced update function to reduce API calls
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdateRef = useRef<{
    start_at: string;
    end_at: string;
  } | null>(null);

  // Schedule a throttled update
  const scheduleUpdate = useCallback(
    (updateData: { start_at: string; end_at: string }) => {
      // For multi-day events, we need to update the original event
      const eventId = event._originalId || id;

      // Store the latest update data
      pendingUpdateRef.current = updateData;
      syncPendingRef.current = true;

      // Immediately update local event data for UI rendering
      // Include locked: true since moving/resizing auto-locks the event
      setLocalEvent((prev) => ({
        ...prev,
        ...updateData,
        locked: true,
      }));

      // Show syncing state immediately
      setIsSyncing(true);
      setUpdateStatus('syncing');

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

                // Revert to original data on error
                setLocalEvent(event);
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
    },
    [updateEvent, event, id, showStatusFeedback]
  );

  // Clean up any pending updates
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Keep local state in sync with prop changes
  useEffect(() => {
    // Only update if we're not in the middle of a drag/resize operation
    if (!isDraggingRef.current && !isResizingRef.current && !isSyncing) {
      setLocalEvent(event);
    }
  }, [event, isSyncing]);

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
        // Use the column index from the graph coloring algorithm
        // Column 0 = base layer (full width), Column 1+ = stacked layers

        // Configuration for layered stacking
        const baseMargin = 4; // Base margin for the day column
        const layerIndent = 16; // Indent for each layer (more visible)
        const layerWidthReduction = 16; // Width reduction per layer
        const minEventWidth = 60; // Minimum width to remain readable

        if (columnIndex === 0) {
          // Column 0 (base layer): FULL WIDTH - same as non-overlapping
          eventWidth = columnWidth - baseMargin;
          eventLeft = dateIdx * columnWidth + dateIdx * 2;
        } else {
          // Column 1+ (stacked layers): indented and slightly narrower
          const indent = layerIndent * columnIndex;
          const widthReduction = layerWidthReduction * columnIndex;

          eventWidth = Math.max(
            minEventWidth,
            columnWidth - widthReduction - 4
          );
          eventLeft = dateIdx * columnWidth + indent + dateIdx * 2;
        }
      } else {
        // No overlaps - use full width (with small margin)
        eventWidth = columnWidth - 4;
        eventLeft = dateIdx * columnWidth + dateIdx * 2;
      }

      cardEl.style.width = `${eventWidth}px`;
      cardEl.style.left = `${eventLeft}px`;

      // Smart z-index layering: Column-based stacking
      // Column 0 = lower z-index (bottom layer)
      // Column 1+ = higher z-index (top layer)
      if (hasOverlaps) {
        cardEl.style.zIndex = String(10 + columnIndex);
      } else {
        cardEl.style.zIndex = '10';
      }

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
      requestAnimationFrame(updatePosition);
    });

    observer.observe(cellEl);

    // Check if the event is in the past
    const isPastEvent = endDate.isBefore(dayjs());

    // Check if this event should be transparent due to hover state
    // An event is transparent if:
    // 1. There are overlaps
    // 2. Another event is being hovered
    // 3. This event's column is higher than the hovered event's column
    // 4. Both events are in the same overlap group
    const shouldBeTransparent =
      overlapCount > 1 &&
      hoveredBaseEventId &&
      hoveredEventColumn !== null &&
      columnIndex > hoveredEventColumn &&
      overlapGroup.includes(hoveredBaseEventId);

    // Set opacity based on transparency state, then past event state
    if (shouldBeTransparent) {
      cardEl.style.opacity = '0.05';
      cardEl.style.pointerEvents = 'none';
    } else if (isPastEvent) {
      cardEl.style.opacity = '0.5';
      cardEl.style.pointerEvents = 'all';
    } else {
      cardEl.style.opacity = '1';
      cardEl.style.pointerEvents = 'all';
    }

    return () => observer.disconnect();
  }, [
    id,
    startDate,
    duration,
    columnIndex,
    dates,
    _isMultiDay,
    _dayPosition,
    startHours,
    endHours,
    overlapCount,
    overlapGroup,
    hoveredBaseEventId,
    hoveredEventColumn,
    endDate.isBefore,
  ]);

  // Event resizing - only enable for non-multi-day events or the start/end segments
  useEffect(() => {
    // Disable resizing for middle segments of multi-day events
    // Note: locked events CAN still be resized - locked only prevents auto-scheduling
    if (_isMultiDay && _dayPosition === 'middle') return;

    const handleEl = handleRef.current;
    const eventCardEl = document.getElementById(`event-${id}`);
    if (!handleEl || !eventCardEl) return;

    let startY = 0;
    let startHeight = 0;
    let hasMoved = false;

    const handleMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

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

        // Schedule the update
        scheduleUpdate({
          start_at: startDate.toISOString(),
          end_at: newEndAt.toISOString(),
        });

        // Explicitly set local event end time for immediate UI update
        setLocalEvent((prev) => ({
          ...prev,
          end_at: newEndAt.toISOString(),
          locked: true,
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

        // Invalidate task schedule query to refresh sidebar
        queryClient.invalidateQueries({
          queryKey: ['task-schedule-batch'],
        });

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
    event._originalId,
    startHours,
    endDate.clone,
    scheduleUpdate,
    showStatusFeedback, // Update visual state
    updateVisualState,
    queryClient,
  ]);

  // Event dragging - only enable for non-multi-day events
  useEffect(() => {
    // Disable dragging for multi-day events only
    // Note: locked events CAN still be dragged - locked only prevents auto-scheduling
    if (_isMultiDay) return;

    const contentEl = contentRef.current;
    const eventCardEl = document.getElementById(`event-${id}`);
    const cellEl = document.querySelector('.calendar-cell') as HTMLDivElement;

    if (!contentEl || !eventCardEl || !cellEl) return;

    let startX = 0;
    let startY = 0;
    let initialCardPosition = { top: 0, left: 0 };
    let columnWidth = 0;
    let hasMoved = false;

    const handleMouseDown = (e: MouseEvent) => {
      // Only handle primary mouse button (left click)
      if (e.button !== 0) return;

      e.stopPropagation();

      // Don't allow multiple operations
      if (isResizingRef.current || isDraggingRef.current) return;

      // Record initial positions
      startX = e.clientX;
      startY = e.clientY;

      // Record initial card position
      initialCardPosition = {
        top: eventCardEl.offsetTop,
        left: eventCardEl.offsetLeft,
      };

      // Update cached dimensions
      columnWidth = cellEl.offsetWidth;

      // Reset tracking state
      hasMoved = false;
      wasDraggedRef.current = false;
      initialPositionRef.current = { x: e.clientX, y: e.clientY };
      currentPositionRef.current = initialCardPosition;
      isDraggingRef.current = true;

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

          // Update visual state
          updateVisualState({ isDragging: true });

          // Other UI adjustments
          hideModal();
          document.body.classList.add('select-none');
        }

        // Snap to grid - ensure we move in whole units
        const snapToGrid = (value: number, gridSize: number) => {
          return Math.round(value / gridSize) * gridSize;
        };

        // Calculate new position with snapping
        const newTop = snapToGrid(initialCardPosition.top + dy, GRID_SNAP);
        const newLeft = snapToGrid(initialCardPosition.left + dx, columnWidth);

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
          // Update visual position immediately (with GPU acceleration)
          eventCardEl.style.transform = `translate3d(${
            newLeft - initialCardPosition.left
          }px, ${constrainedTop - initialCardPosition.top}px, 0)`;

          // Store the current position
          currentPositionRef.current = { top: constrainedTop, left: newLeft };

          // Calculate new times based on position
          const newDateIdx = Math.floor(newLeft / columnWidth);
          // Calculate hours directly from pixels - improve precision
          const newStartHour = constrainedTop / HOUR_HEIGHT;
          const newStartHourFloor = Math.floor(newStartHour);
          const newStartMinute = Math.round(
            (newStartHour - newStartHourFloor) * 60
          );

          const newStartAt = startDate.toDate();
          newStartAt.setHours(newStartHourFloor);
          newStartAt.setMinutes(newStartMinute);

          // Snap start time to 15-minute intervals
          const roundedStartAt = roundToNearest15Minutes(newStartAt);

          // Adjust the visual position to match the snapped time
          const roundedHours =
            roundedStartAt.getHours() + roundedStartAt.getMinutes() / 60;
          const roundedTop = roundedHours * HOUR_HEIGHT;

          // Update the visual position to match the snapped time
          eventCardEl.style.transform = `translate3d(${Math.max(
            (newLeft - initialCardPosition.left) / 60 - 4,
            0
          )}px, ${Math.max((roundedTop - initialCardPosition.top) / 60 - 4, 0)}px, 0)`;

          // Update the current position reference
          currentPositionRef.current = { top: roundedTop, left: newLeft };

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

          // Schedule update
          scheduleUpdate({
            start_at: roundedStartAt.toISOString(),
            end_at: newEndAt.toISOString(),
          });

          // Explicitly update local event for immediate UI update
          setLocalEvent((prev) => ({
            ...prev,
            start_at: roundedStartAt.toISOString(),
            end_at: newEndAt.toISOString(),
            locked: true,
          }));
        }
      };

      const handleMouseUp = (e: MouseEvent) => {
        if (hasMoved) {
          // Reset drag state
          isDraggingRef.current = false;
          updateVisualState({ isDragging: false });
          document.body.classList.remove('select-none');
          document.body.style.cursor = '';

          // Set flag to indicate this was a drag operation
          wasDraggedRef.current = true;

          // Need to update the actual position properties
          // to match the transform we've been using
          if (eventCardEl) {
            const currentTop = currentPositionRef.current.top;
            const currentLeft = currentPositionRef.current.left;

            // Reset transform and set direct position
            eventCardEl.style.transform = '';
            eventCardEl.style.top = `${currentTop}px`;
            eventCardEl.style.left = `${currentLeft}px`;

            // Ensure final update is sent
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
          }
        } else {
          // Reset state if no actual drag occurred
          isDraggingRef.current = false;
          updateVisualState({ isDragging: false });
          document.body.classList.remove('select-none');
          document.body.style.cursor = '';

          // Check if this was just a click (no significant movement)
          const deltaX = Math.abs(e.clientX - initialPositionRef.current.x);
          const deltaY = Math.abs(e.clientY - initialPositionRef.current.y);

          if (deltaX < 5 && deltaY < 5) {
            openModal(event._originalId || id);
          }
        }

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
    };

    contentEl.addEventListener('mousedown', handleMouseDown);
    return () => contentEl.removeEventListener('mousedown', handleMouseDown);
  }, [
    id,
    startDate,
    endDate,
    dates,
    updateEvent,
    hideModal,
    openModal,
    _isMultiDay,
    event._originalId,
    scheduleUpdate,
    showStatusFeedback, // Update visual state for immediate feedback
    updateVisualState,
  ]);

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

  const { settings: calendarSettings } = useCalendarSettings();

  // Format time for display
  const formatEventTime = (date: Date | dayjs.Dayjs) => {
    const timeFormat = calendarSettings.appearance.timeFormat;
    const d = dayjs.isDayjs(date)
      ? date
      : tz === 'auto'
        ? dayjs(date)
        : dayjs(date).tz(tz);

    // Special case: if time is 23:59, show as 12:00 AM (midnight)
    if (d.hour() === 23 && d.minute() === 59) {
      return timeFormat === '24h' ? '00:00' : '12:00 am';
    }

    return d.format(timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
  };

  // Check if the event is in the past
  const isPastEvent = new Date(end_at) < new Date();

  // Check if this event is affected by preview (will be modified/deleted)
  const isAffectedByPreview =
    affectedEventIds?.has(id) || affectedEventIds?.has(event._originalId || '');

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

  // Determine if this event has calendar source info
  const hasCalendarInfo =
    google_calendar_id && google_calendar_id !== 'primary';
  const calendarDisplayName =
    _calendarName ||
    (google_calendar_id === 'primary'
      ? 'Primary Calendar'
      : google_calendar_id);

  // Calculate stacking position for visual effects
  // Note: Actual column-based positioning is handled in the useEffect
  const hasOverlaps = overlapCount > 1;

  // Check if an event in the same group is being hovered
  // This event should be transparent if:
  // 1. There are overlaps
  // 2. Another event is being hovered
  // 3. This event's column is higher than the hovered event's column
  // 4. Both events are in the same overlap group
  const shouldBeTransparent =
    hasOverlaps &&
    hoveredBaseEventId &&
    hoveredEventColumn !== null &&
    columnIndex > hoveredEventColumn &&
    overlapGroup.includes(hoveredBaseEventId);

  // For visual effects, check if this is likely a shorter event (higher in stack)
  // Shorter events get enhanced visual treatment
  const isLikelyTopEvent = hasOverlaps && duration < 1.5; // Events < 1.5 hours likely on top

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          ref={cardRef}
          id={`event-${id}`}
          className={cn(
            'pointer-events-auto absolute max-w-none select-none overflow-hidden rounded-r-md rounded-l transition-all duration-300',
            'group hover:ring-1 focus:outline-none',
            {
              'transform shadow-md': isDragging || isResizing, // Subtle transform during interaction
              'shadow-sm': hasOverlaps && !isDragging && !isResizing, // Subtle shadow for stacked events
              'hover:shadow-md': hasOverlaps, // Enhanced shadow on hover for stacked events
              'opacity-50': isPastEvent && !isAffectedByPreview, // Lower opacity for past events
              'opacity-30 grayscale transition-all duration-500':
                isAffectedByPreview, // Dim affected events during preview
              'rounded-l-none border-l-4': showStartIndicator, // Special styling for continuation from previous day
              'rounded-r-none border-r-4': showEndIndicator, // Special styling for continuation to next day
              'border-l-[3px]': hasCalendarInfo, // Thicker border for calendar events
              // Habit-specific styling (icon only, no dashed border)
              'opacity-60': _isHabit && _habitCompleted, // Dimmed for completed habits
              // Preview-specific styling - dashed border only for NEW/MOVED events (not reused)
              'border-2 border-dashed': _isPreview && !_isReused,
            },
            level ? 'border border-l-2' : 'border-l-2',
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
            // Add calendar color accent if available
            borderLeftColor: _calendarColor || undefined,
            // Enhanced border for shorter events (likely on top)
            borderLeftWidth:
              hasOverlaps && isLikelyTopEvent ? '3px' : undefined,
            // Significantly lowered opacity for stacked events when base is hovered
            opacity: shouldBeTransparent ? 0.05 : 1,
            // Maintain pointer events even when transparent
            pointerEvents: shouldBeTransparent ? 'none' : undefined,
          }}
          onMouseEnter={() => {
            setIsHovering(true);
            // Set this event as hovered (any level) so events above it become transparent
            if (hasOverlaps) {
              setHoveredBaseEventId(id);
              setHoveredEventColumn(columnIndex);
            }
          }}
          onMouseLeave={() => {
            setIsHovering(false);
            // Clear hover state
            if (hasOverlaps) {
              setHoveredBaseEventId(null);
              setHoveredEventColumn(null);
            }
          }}
          tabIndex={0}
          onClick={(e) => {
            // Only open modal if we haven't just finished dragging or resizing
            if (!wasDraggedRef.current && !wasResizedRef.current) {
              e.stopPropagation();
              // Open the modal with the event, it will be read-only if locked
              openModal(event._originalId || id);
            }

            // Reset state flags
            wasDraggedRef.current = false;
            wasResizedRef.current = false;
          }}
          aria-label={`Event: ${title || 'Untitled event'}${hasCalendarInfo ? ` from ${calendarDisplayName}` : ''}`}
          title={
            hasCalendarInfo ? `Calendar: ${calendarDisplayName}` : undefined
          }
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

          {/* Habit indicator */}
          {_isHabit && (
            <div className="absolute top-1 right-1 z-10">
              <Repeat
                className={cn(
                  'h-3 w-3',
                  _habitCompleted
                    ? 'text-dynamic-green'
                    : 'text-primary opacity-70'
                )}
              />
            </div>
          )}

          {/* Warning indicator */}
          {_warning && (
            <div
              className={cn(
                'absolute right-1 z-10',
                _isHabit ? 'top-5' : 'top-1'
              )}
              title={_warning}
            >
              <AlertTriangle className="h-3 w-3 text-dynamic-red" />
            </div>
          )}

          {/* Edit button overlay */}
          <div
            className={cn(
              'absolute top-2 rounded-full p-0.5 opacity-0 shadow-sm',
              _isHabit ? 'right-5' : 'right-2', // Offset if habit icon is shown
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
              'flex h-full select-none flex-col text-left',
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
                  'font-semibold text-xs',
                  duration <= 0.5 ? 'line-clamp-1' : 'line-clamp-2'
                )}
              >
                {_isPreview && !_isReused && (
                  <Eye
                    className={cn(
                      'mr-1 inline-block h-3 w-3 align-middle opacity-80',
                      _previewType === 'habit'
                        ? 'text-dynamic-green'
                        : _previewType === 'task'
                          ? 'text-dynamic-purple'
                          : 'text-dynamic-blue'
                    )}
                  />
                )}
                {localEvent.locked && !_isPreview && (
                  <Lock className="mr-1 inline-block h-3 w-3 align-middle opacity-70" />
                )}
                <span>{localEvent.title || 'Untitled event'}</span>
                {_isPreview && !_isReused && (
                  <span
                    className={cn(
                      'ml-1 rounded px-1 font-medium text-[10px]',
                      _previewType === 'habit'
                        ? 'bg-dynamic-green/20 text-dynamic-green'
                        : _previewType === 'task'
                          ? 'bg-dynamic-purple/20 text-dynamic-purple'
                          : 'bg-dynamic-blue/20 text-dynamic-blue'
                    )}
                  >
                    {_previewType === 'habit'
                      ? 'Habit'
                      : _previewType === 'task'
                        ? 'Task'
                        : 'Preview'}
                  </span>
                )}
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
                <div
                  className="event-description mt-1 line-clamp-2 text-xs"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: <html is sanitized>
                  dangerouslySetInnerHTML={{
                    __html: containsHtml(description)
                      ? sanitizeHtml(description)
                      : description,
                  }}
                />
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
            />
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          onClick={() => openModal(event._originalId || id)}
          className="flex items-center gap-2"
        >
          <Edit className="h-4 w-4" />
          <span>Edit Event</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={handleLockToggle}
          className="flex items-center gap-2"
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
          <ContextMenuSubTrigger className="flex items-center gap-2">
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
          className="flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete Event</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
