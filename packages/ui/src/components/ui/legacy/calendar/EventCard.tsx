import { useCalendar } from '../../../../hooks/use-calendar';
import {
  GRID_SNAP,
  HOUR_HEIGHT,
  LEVEL_WIDTH_OFFSET,
  MAX_HOURS,
  MIN_EVENT_HEIGHT,
} from './config';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Pencil,
  RefreshCw,
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
    _isMultiDay,
    _dayPosition,
  } = event;

  const { updateEvent, hideModal, openModal } = useCalendar();

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

    // Reset status after 1.5 seconds
    statusTimeoutRef.current = setTimeout(() => {
      setUpdateStatus('idle');
      statusTimeoutRef.current = null;
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

      // Use the provided level for horizontal positioning
      const levelOffset = level * LEVEL_WIDTH_OFFSET;
      const left = dateIdx * columnWidth + levelOffset;

      // Calculate width based on level to prevent overflow
      const widthPercentage = Math.max(60, 100 - level * 5); // Decrease width as level increases
      const width = (columnWidth * widthPercentage) / 100 - 8;

      cardEl.style.width = `${width}px`;
      cardEl.style.left = `${left + dateIdx * 2}px`;
      // Set z-index based on level to ensure proper stacking
      cardEl.style.zIndex = `${10 * level}`; // Higher levels (more overlaps) get lower z-index

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
  ]);

  // Event resizing - only enable for non-multi-day events or the start/end segments
  useEffect(() => {
    // Disable resizing for middle segments of multi-day events
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

        eventCardEl.style.height = `${Math.min(newHeight, maxHeight)}px`;

        // Calculate new end time
        let newEndAt: Date;

        if (_isMultiDay) {
          if (_dayPosition === 'start') {
            // For start segment, we're adjusting the end time of the first day
            newEndAt = new Date(startDate);
            const newEndHour = Math.min(
              23,
              Math.floor(newHeight / HOUR_HEIGHT + startHours)
            );
            const newEndMinute = Math.round(
              ((newHeight / HOUR_HEIGHT + startHours) % 1) * 60
            );
            newEndAt.setHours(newEndHour, newEndMinute);
            // Snap to 15-minute intervals
            newEndAt = roundToNearest15Minutes(newEndAt);
          } else if (_dayPosition === 'end') {
            // For end segment, we're adjusting the end time of the last day
            newEndAt = new Date(endDate);
            const newDuration = newHeight / HOUR_HEIGHT;
            const newEndHour = Math.min(23, Math.floor(newDuration));
            const newEndMinute = Math.round((newDuration % 1) * 60);
            newEndAt.setHours(newEndHour, newEndMinute);
            // Snap to 15-minute intervals
            newEndAt = roundToNearest15Minutes(newEndAt);
          } else {
            return; // Should not happen
          }
        } else {
          // Regular event
          const newDuration = newHeight / HOUR_HEIGHT; // Convert pixels to hours
          newEndAt = new Date(startDate);
          const extraHours = Math.floor(newDuration);
          const extraMinutes = Math.round((newDuration - extraHours) * 60);
          newEndAt.setHours(startDate.getHours() + extraHours);
          newEndAt.setMinutes(startDate.getMinutes() + extraMinutes);

          // Snap to 15-minute intervals
          newEndAt = roundToNearest15Minutes(newEndAt);

          // Ensure end time doesn't wrap to the next day
          if (newEndAt < startDate) {
            newEndAt.setDate(newEndAt.getDate() + 1);
          }
        }

        // After calculating the rounded end time, adjust the visual height to match
        if (!_isMultiDay) {
          const durationInHours =
            (newEndAt.getTime() - startDate.getTime()) / (1000 * 60 * 60);
          const adjustedHeight = durationInHours * HOUR_HEIGHT;
          eventCardEl.style.height = `${Math.max(MIN_EVENT_HEIGHT, adjustedHeight)}px`;
        }

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
  ]);

  // Event dragging - only enable for non-multi-day events
  useEffect(() => {
    // Disable dragging for multi-day events
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
          const newStartHour = Math.floor(constrainedTop / HOUR_HEIGHT);
          const newStartMinute = Math.round(
            ((constrainedTop % HOUR_HEIGHT) / HOUR_HEIGHT) * 60
          );

          const newStartAt = new Date(startDate);
          newStartAt.setHours(newStartHour);
          newStartAt.setMinutes(newStartMinute);

          // Snap start time to 15-minute intervals
          const roundedStartAt = roundToNearest15Minutes(newStartAt);

          // Adjust the visual position to match the snapped time if needed
          if (newStartAt.getTime() !== roundedStartAt.getTime()) {
            const roundedHours =
              roundedStartAt.getHours() + roundedStartAt.getMinutes() / 60;
            const roundedTop = roundedHours * HOUR_HEIGHT;

            // Update the visual position to match the snapped time
            eventCardEl.style.transform = `translate3d(${
              newLeft - initialCardPosition.left
            }px, ${roundedTop - initialCardPosition.top}px, 0)`;

            // Update the current position reference
            currentPositionRef.current = { top: roundedTop, left: newLeft };
          }

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
  ]);

  // Normalize color to match SupportedColor type (uppercase)
  const normalizedColor =
    typeof color === 'string' ? color.toUpperCase() : 'BLUE';

  // Color styles based on event color
  const getEventStyles = () => {
    const colorStyles: Record<
      string,
      {
        bg: string;
        border: string;
        text: string;
        dragBg: string;
        syncingBg: string;
        successBg: string;
        errorBg: string;
      }
    > = {
      BLUE: {
        bg: 'bg-calendar-bg-blue hover:ring-dynamic-light-blue/80',
        border: 'border-dynamic-light-blue/80',
        text: 'text-dynamic-light-blue',
        dragBg: 'bg-calendar-bg-blue/70',
        syncingBg: 'bg-calendar-bg-blue',
        successBg: 'bg-calendar-bg-blue/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      RED: {
        bg: 'bg-calendar-bg-red hover:ring-dynamic-light-red/80',
        border: 'border-dynamic-light-red/80',
        text: 'text-dynamic-light-red',
        dragBg: 'bg-calendar-bg-red/70',
        syncingBg: 'bg-calendar-bg-red',
        successBg: 'bg-calendar-bg-red/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      GREEN: {
        bg: 'bg-calendar-bg-green hover:ring-dynamic-light-green/80',
        border: 'border-dynamic-light-green/80',
        text: 'text-dynamic-light-green',
        dragBg: 'bg-calendar-bg-green/70',
        syncingBg: 'bg-calendar-bg-green',
        successBg: 'bg-calendar-bg-green/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      YELLOW: {
        bg: 'bg-calendar-bg-yellow hover:ring-dynamic-light-yellow/80',
        border: 'border-dynamic-light-yellow/80',
        text: 'text-dynamic-light-yellow',
        dragBg: 'bg-calendar-bg-yellow/70',
        syncingBg: 'bg-calendar-bg-yellow',
        successBg: 'bg-calendar-bg-yellow/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      PURPLE: {
        bg: 'bg-calendar-bg-purple hover:ring-dynamic-light-purple/80',
        border: 'border-dynamic-light-purple/80',
        text: 'text-dynamic-light-purple',
        dragBg: 'bg-calendar-bg-purple/70',
        syncingBg: 'bg-calendar-bg-purple',
        successBg: 'bg-calendar-bg-purple/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      PINK: {
        bg: 'bg-calendar-bg-pink hover:ring-dynamic-light-pink/80',
        border: 'border-dynamic-light-pink/80',
        text: 'text-dynamic-light-pink',
        dragBg: 'bg-calendar-bg-pink/70',
        syncingBg: 'bg-calendar-bg-pink',
        successBg: 'bg-calendar-bg-pink/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      ORANGE: {
        bg: 'bg-calendar-bg-orange hover:ring-dynamic-light-orange/80',
        border: 'border-dynamic-light-orange/80',
        text: 'text-dynamic-light-orange',
        dragBg: 'bg-calendar-bg-orange/70',
        syncingBg: 'bg-calendar-bg-orange',
        successBg: 'bg-calendar-bg-orange/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      INDIGO: {
        bg: 'bg-calendar-bg-indigo hover:ring-dynamic-light-indigo/80',
        border: 'border-dynamic-light-indigo/80',
        text: 'text-dynamic-light-indigo',
        dragBg: 'bg-calendar-bg-indigo/70',
        syncingBg: 'bg-calendar-bg-indigo',
        successBg: 'bg-calendar-bg-indigo/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      CYAN: {
        bg: 'bg-calendar-bg-cyan hover:ring-dynamic-light-cyan/80',
        border: 'border-dynamic-light-cyan/80',
        text: 'text-dynamic-light-cyan',
        dragBg: 'bg-calendar-bg-cyan/70',
        syncingBg: 'bg-calendar-bg-cyan',
        successBg: 'bg-calendar-bg-cyan/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
      GRAY: {
        bg: 'bg-calendar-bg-gray hover:ring-dynamic-light-gray/80',
        border: 'border-dynamic-light-gray/80',
        text: 'text-dynamic-light-gray',
        dragBg: 'bg-calendar-bg-gray/70',
        syncingBg: 'bg-calendar-bg-gray',
        successBg: 'bg-calendar-bg-gray/90 transition-colors duration-300',
        errorBg: 'bg-red-100 transition-colors duration-300',
      },
    };

    return colorStyles[normalizedColor] || colorStyles.BLUE;
  };

  const { bg, border, text, dragBg, syncingBg, successBg, errorBg } =
    getEventStyles()!;

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
    return format(date, 'h:mm a');
  };

  // Check if the event is in the past
  const isPastEvent = new Date(end_at) < new Date();

  return (
    <div
      ref={cardRef}
      id={`event-${id}`}
      className={cn(
        'pointer-events-auto absolute max-w-none overflow-hidden rounded-l rounded-r-md border-l-2 select-none',
        'group transition-all hover:ring-1 focus:outline-none',
        level > 0 && 'border border-l-2',
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
          { '!opacity-0': isDragging || isResizing || updateStatus !== 'idle' } // Hide during interaction or status updates
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
          'flex h-full flex-col p-1 text-left text-sm select-none',
          duration <= 0.5 && 'text-xs',
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
              'text-xs font-semibold',
              duration <= 0.5 ? 'line-clamp-1' : 'line-clamp-2'
            )}
          >
            {localEvent.title || 'Untitled event'}
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
  );
}
