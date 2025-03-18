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
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
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
import { useEffect, useRef, useState } from 'react';

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

export default function EventCard({ dates, event, level = 0 }: EventCardProps) {
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

  const { updateEvent, hideModal, openModal, deleteEvent } = useCalendar();

  // Local state for immediate UI updates
  const [localEvent, setLocalEvent] = useState<CalendarEvent>(event);

  // Parse dates properly
  const startDate = new Date(localEvent.start_at);
  const endDate = new Date(localEvent.end_at);

  // Calculate hours with decimal minutes for positioning
  const startHours = Math.min(
    MAX_HOURS - 0.01,
    startDate.getHours() + startDate.getMinutes() / 60
  );

  const endHours = Math.min(
    MAX_HOURS,
    endDate.getHours() + endDate.getMinutes() / 60
  );

  // Calculate duration, handling overnight events correctly
  const duration =
    endHours <= startHours && !_isMultiDay
      ? MAX_HOURS - startHours + endHours
      : endHours - startHours;

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
  const scheduleUpdate = (updateData: { start_at: string; end_at: string }) => {
    // For multi-day events, we need to update the original event
    const eventId = event._originalId || id;

    // Store the latest update data
    pendingUpdateRef.current = updateData;
    syncPendingRef.current = true;

    // Immediately update local event data for UI rendering
    setLocalEvent((prev) => ({
      ...prev,
      ...updateData,
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
  };

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
        date.getFullYear() === eventDate.getFullYear() &&
        date.getMonth() === eventDate.getMonth() &&
        date.getDate() === eventDate.getDate()
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
      let eventWidth, eventLeft;

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
        eventLeft = dateIdx * columnWidth + 4; // 4px margin on each side
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
      requestAnimationFrame(updatePosition);
    });

    observer.observe(cellEl);

    // Check if the event is in the past
    const isPastEvent = new Date(end_at) < new Date();

    // Set opacity based on whether the event is in the past
    cardEl.style.opacity = isPastEvent ? '0.5' : '1';
    cardEl.style.pointerEvents = 'all';

    return () => observer.disconnect();
  }, [
    id,
    startDate,
    duration,
    level,
    dates,
    _isMultiDay,
    _dayPosition,
    startHours,
    endHours,
    overlapCount,
    overlapGroup,
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

      // Don't allow interaction with locked events
      if (locked) return;

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
        let newEndAt: Date;

        if (_isMultiDay) {
          if (_dayPosition === 'start') {
            // For start segment, we're adjusting the end time of the first day
            newEndAt = new Date(startDate);
            // Calculate hours directly from pixels for better precision
            const newEndHours = constrainedHeight / HOUR_HEIGHT + startHours;
            const newEndHour = Math.min(23, Math.floor(newEndHours));
            const newEndMinute = Math.round(
              (newEndHours - Math.floor(newEndHours)) * 60
            );
            newEndAt.setHours(newEndHour, newEndMinute);
            // Snap to 15-minute intervals
            newEndAt = roundToNearest15Minutes(newEndAt);
          } else if (_dayPosition === 'end') {
            // For end segment, we're adjusting the end time of the last day
            newEndAt = new Date(endDate);
            const newDuration = constrainedHeight / HOUR_HEIGHT;
            const newEndHour = Math.min(23, Math.floor(newDuration));
            const newEndMinute = Math.round(
              (newDuration - Math.floor(newDuration)) * 60
            );
            newEndAt.setHours(newEndHour, newEndMinute);
            // Snap to 15-minute intervals
            newEndAt = roundToNearest15Minutes(newEndAt);
          } else {
            return; // Should not happen
          }
        } else {
          // Regular event
          const newDuration = constrainedHeight / HOUR_HEIGHT; // Convert pixels to hours
          // Calculate end time directly from start time + duration
          newEndAt = new Date(startDate);
          // Use exact duration calculations
          newEndAt.setTime(startDate.getTime() + newDuration * 60 * 60 * 1000);

          // Snap to 15-minute intervals
          newEndAt = roundToNearest15Minutes(newEndAt);

          // Ensure end time doesn't wrap to the next day
          if (newEndAt < startDate) {
            newEndAt.setDate(newEndAt.getDate() + 1);
          }
        }

        // After calculating the rounded end time, adjust the visual height to match
        const durationInHours =
          (newEndAt.getTime() - startDate.getTime()) / (1000 * 60 * 60);
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
    event._originalId,
    startHours,
    locked,
  ]);

  // Event dragging - only enable for non-multi-day events
  useEffect(() => {
    // Disable dragging for multi-day events or locked events
    if (_isMultiDay || locked) return;

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

      // Don't allow interaction with locked events
      if (locked) return;

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

          const newStartAt = new Date(startDate);
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
          const newEndAt = new Date(roundedStartAt);
          const durationMs = endDate.getTime() - startDate.getTime();
          newEndAt.setTime(roundedStartAt.getTime() + durationMs);

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
    locked,
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

  // Format time for display
  const formatEventTime = (date: Date) => {
    const { settings } = useCalendar();
    const timeFormat = settings.appearance.timeFormat;

    return format(date, timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={cardRef}
          id={`event-${id}`}
          className={cn(
            'pointer-events-auto absolute max-w-none overflow-hidden rounded-l rounded-r-md border-l-2 select-none',
            'group transition-all hover:ring-1 focus:outline-none',
            {
              'transform shadow-md': isDragging || isResizing, // Subtle transform during interaction
              'opacity-50': isPastEvent, // Lower opacity for past events
              'rounded-l-none border-l-4': showStartIndicator, // Special styling for continuation from previous day
              'rounded-r-none border-r-4': showEndIndicator, // Special styling for continuation to next day
            },
            border,
            text,
            getBackgroundStyle() // Use dynamic background based on status
          )}
          style={{
            transition:
              isDragging || isResizing
                ? 'none' // No transition during interaction
                : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: isHovering || isDragging || isResizing ? 50 : 10 - level, // Use level for z-index
            willChange: isDragging || isResizing ? 'transform' : 'auto', // GPU acceleration
          }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
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
                '!opacity-0':
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
                className="animate-shimmer h-full w-full bg-gradient-to-r from-transparent via-background/10 to-transparent"
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
                    className="mt-0.5 inline-block h-3 w-3 flex-shrink-0 -translate-y-0.5 opacity-70"
                    aria-label="Event locked"
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
            'cursor-not-allowed opacity-50': locked,
          })}
          disabled={locked}
        >
          <Edit className="h-4 w-4" />
          <span>{locked ? 'View Event' : 'Edit Event'}</span>
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
          <ContextMenuSubTrigger
            className={cn('flex items-center gap-2', {
              'cursor-not-allowed opacity-50': locked,
            })}
            disabled={locked}
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
            'cursor-not-allowed opacity-50': locked,
          })}
          disabled={locked}
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete Event</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
