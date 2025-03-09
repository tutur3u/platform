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
import { ArrowLeft, ArrowRight, Clock, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
    start_at,
    end_at,
    color = 'BLUE',
    _isMultiDay,
    _dayPosition,
  } = event;

  const { updateEvent, hideModal, openModal } = useCalendar();

  // Parse dates properly
  const startDate = new Date(start_at);
  const endDate = new Date(end_at);

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
  const [visualState, setVisualState] = useState({
    isDragging: false,
    isResizing: false,
  });

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

    // Only start a new timer if there isn't one already
    if (!updateTimeoutRef.current) {
      // Show syncing state
      setIsSyncing(true);

      updateTimeoutRef.current = setTimeout(() => {
        if (pendingUpdateRef.current) {
          updateEvent(eventId, pendingUpdateRef.current)
            .catch((error) => {
              console.error('Failed to update event:', error);
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
      const width = (columnWidth * widthPercentage) / 100 - 16;

      cardEl.style.width = `${width}px`;
      cardEl.style.left = `${left}px`;
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
          } else if (_dayPosition === 'end') {
            // For end segment, we're adjusting the end time of the last day
            newEndAt = new Date(endDate);
            const newDuration = newHeight / HOUR_HEIGHT;
            const newEndHour = Math.min(23, Math.floor(newDuration));
            const newEndMinute = Math.round((newDuration % 1) * 60);
            newEndAt.setHours(newEndHour, newEndMinute);
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

          // Ensure end time doesn't wrap to the next day
          if (newEndAt < startDate) {
            newEndAt.setDate(newEndAt.getDate() + 1);
          }
        }

        // Schedule the update
        scheduleUpdate({
          start_at: startDate.toISOString(),
          end_at: newEndAt.toISOString(),
        });
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        updateVisualState({ isResizing: false });

        // Restore cursor
        document.body.style.cursor = '';
        document.body.classList.remove('select-none');

        // Send a final update if needed
        if (pendingUpdateRef.current) {
          setIsSyncing(true);
          updateEvent(event._originalId || id, pendingUpdateRef.current)
            .catch((error) => {
              console.error('Failed to update event:', error);
            })
            .finally(() => {
              setIsSyncing(false);
            });
          pendingUpdateRef.current = null;
        }

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
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

          // Update date if moved to different day
          if (newDateIdx >= 0 && newDateIdx < dates.length) {
            const newDate = dates[newDateIdx];
            if (newDate) {
              newStartAt.setFullYear(newDate.getFullYear());
              newStartAt.setMonth(newDate.getMonth());
              newStartAt.setDate(newDate.getDate());
            }
          }

          // Calculate new end time maintaining original duration
          const newEndAt = new Date(newStartAt);
          const durationMs = endDate.getTime() - startDate.getTime();
          newEndAt.setTime(newStartAt.getTime() + durationMs);

          // Schedule update
          scheduleUpdate({
            start_at: newStartAt.toISOString(),
            end_at: newEndAt.toISOString(),
          });
        }
      };

      const handleMouseUp = (e: MouseEvent) => {
        if (hasMoved) {
          // Reset drag state
          isDraggingRef.current = false;
          updateVisualState({ isDragging: false });
          document.body.classList.remove('select-none');

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
              setIsSyncing(true);
              updateEvent(event._originalId || id, pendingUpdateRef.current)
                .catch((error) => {
                  console.error('Failed to update event:', error);
                })
                .finally(() => {
                  setIsSyncing(false);
                });
              pendingUpdateRef.current = null;
            }
          }
        } else {
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
      { bg: string; border: string; text: string }
    > = {
      BLUE: {
        bg: 'bg-calendar-bg-blue',
        border: 'border-dynamic-light-blue/80',
        text: 'text-dynamic-light-blue',
      },
      RED: {
        bg: 'bg-calendar-bg-red',
        border: 'border-dynamic-light-red/80',
        text: 'text-dynamic-light-red',
      },
      GREEN: {
        bg: 'bg-calendar-bg-green',
        border: 'border-dynamic-light-green/80',
        text: 'text-dynamic-light-green',
      },
      YELLOW: {
        bg: 'bg-calendar-bg-yellow',
        border: 'border-dynamic-light-yellow/80',
        text: 'text-dynamic-light-yellow',
      },
      PURPLE: {
        bg: 'bg-calendar-bg-purple',
        border: 'border-dynamic-light-purple/80',
        text: 'text-dynamic-light-purple',
      },
      PINK: {
        bg: 'bg-calendar-bg-pink',
        border: 'border-dynamic-light-pink/80',
        text: 'text-dynamic-light-pink',
      },
      ORANGE: {
        bg: 'bg-calendar-bg-orange',
        border: 'border-dynamic-light-orange/80',
        text: 'text-dynamic-light-orange',
      },
      INDIGO: {
        bg: 'bg-calendar-bg-indigo',
        border: 'border-dynamic-light-indigo/80',
        text: 'text-dynamic-light-indigo',
      },
      CYAN: {
        bg: 'bg-calendar-bg-cyan',
        border: 'border-dynamic-light-cyan/80',
        text: 'text-dynamic-light-cyan',
      },
      GRAY: {
        bg: 'bg-calendar-bg-gray',
        border: 'border-dynamic-light-gray/80',
        text: 'text-dynamic-light-gray',
      },
    };

    return colorStyles[normalizedColor] || colorStyles.BLUE;
  };

  const { bg, border, text } = getEventStyles()!;

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
        'pointer-events-auto absolute max-w-none overflow-hidden rounded-md border-l-4 select-none',
        'group hover:ring-2 hover:ring-primary/50 focus:outline-none',
        {
          'opacity-80': isDragging || isResizing, // Lower opacity during interaction
          'opacity-50': isPastEvent, // Lower opacity for past events
          'animate-pulse': isSyncing, // Pulse animation during sync
          'rounded-l-none border-l-4': showStartIndicator, // Special styling for continuation from previous day
          'rounded-r-none border-r-4': showEndIndicator, // Special styling for continuation to next day
        },
        bg,
        border,
        text
      )}
      style={{
        transition:
          isDragging || isResizing
            ? 'none' // No transition during interaction
            : 'opacity 300ms ease-in-out, transform 150ms ease',
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
          'absolute top-1 right-1 rounded-full bg-background/80 p-0.5 opacity-0 shadow-sm',
          'z-10 transition-opacity group-hover:opacity-100', // Higher z-index
          { '!opacity-0': isDragging || isResizing } // Hide during interaction
        )}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          openModal(event._originalId || id);
        }}
      >
        <Pencil className="h-3 w-3" />
      </div>

      {/* Syncing indicator */}
      {isSyncing && (
        <div className="pointer-events-none absolute inset-0 z-20 bg-background/5">
          <div
            className="animate-shimmer h-full w-full bg-gradient-to-r from-transparent via-background/10 to-transparent"
            style={{ backgroundSize: '200% 100%' }}
          />
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
          <div className="line-clamp-2 text-xs font-medium">
            {title || 'Untitled event'}
          </div>

          {/* Show time for regular events or start/end segments of multi-day events */}
          {((!_isMultiDay && duration > 0.5) ||
            (_isMultiDay &&
              (_dayPosition === 'start' || _dayPosition === 'end'))) && (
            <div className="mt-1 flex items-center text-xs opacity-80">
              <Clock className="mr-1 inline h-3 w-3" />
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
