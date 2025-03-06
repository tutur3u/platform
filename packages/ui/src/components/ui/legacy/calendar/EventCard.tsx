import { useCalendar } from '../../../../hooks/use-calendar';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { cn } from '@tuturuuu/utils/format';
import { Pencil } from 'lucide-react';
import moment from 'moment';
import { useEffect, useRef, useState } from 'react';

interface EventCardProps {
  dates: Date[];
  wsId: string;
  event: CalendarEvent;
}

export default function EventCard({ dates, event }: EventCardProps) {
  const { id, title, description, start_at, end_at, color = 'BLUE' } = event;
  const {
    getEventLevel: getLevel,
    updateEvent,
    hideModal,
    // showModal,
    openModal,
  } = useCalendar();

  const startDate = moment(start_at).toDate();
  const endDate = moment(end_at).toDate();

  const startHours = startDate.getHours() + startDate.getMinutes() / 60;
  const endHours = endDate.getHours() + endDate.getMinutes() / 60;
  const duration =
    startHours > endHours ? 24 - startHours : endHours - startHours;
  const level = getLevel ? getLevel(id) : 0;

  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // References for tracking state - avoid unnecessary renders
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const wasDraggedRef = useRef(false);
  const wasResizedRef = useRef(false);
  const initialPositionRef = useRef({ x: 0, y: 0 });
  const currentPositionRef = useRef({ top: 0, left: 0 });
  const syncPendingRef = useRef(false);

  // Visual states that trigger renders - minimal state
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
    // Store the latest update data
    pendingUpdateRef.current = updateData;
    syncPendingRef.current = true;

    // Only start a new timer if there isn't one already
    if (!updateTimeoutRef.current) {
      // Show syncing state
      setIsSyncing(true);

      updateTimeoutRef.current = setTimeout(() => {
        if (pendingUpdateRef.current) {
          updateEvent(id, pendingUpdateRef.current)
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

    // Calculate event height
    const height = Math.max(20 - 4, duration * 80 - 4);

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
    cardEl.style.height = `${height}px`;
    cardEl.style.top = `${startHours * 80}px`;

    const updatePosition = () => {
      const columnWidth = cellEl.offsetWidth;
      const left = dateIdx * columnWidth + level * 12;
      const width = columnWidth - level * 12 - 4;

      cardEl.style.width = `${width}px`;
      cardEl.style.left = `${left}px`;

      // Store the initial position
      currentPositionRef.current = {
        top: parseInt(cardEl.style.top, 10),
        left: parseInt(cardEl.style.left, 10),
      };
    };

    // Set initial position
    updatePosition();

    // Track resize for responsive layout
    const observer = new ResizeObserver(updatePosition);
    observer.observe(cellEl);

    cardEl.style.opacity = '1';
    cardEl.style.pointerEvents = 'all';

    return () => observer.disconnect();
  }, [id, startDate, duration, level, dates]);

  // Event resizing
  useEffect(() => {
    const handleEl = handleRef.current;
    const cardEl = handleEl?.parentElement;
    if (!handleEl || !cardEl) return;

    let startY = 0;
    let startHeight = 0;
    let hasMoved = false;

    const handleMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Don't allow multiple operations
      if (isDraggingRef.current || isResizingRef.current) return;

      startY = e.clientY;
      startHeight = cardEl.offsetHeight;
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

        // Snap to grid (20px)
        const newHeight = Math.max(
          20,
          Math.round((startHeight + dy) / 20) * 20
        );

        // Update height
        cardEl.style.height = `${newHeight - 4}px`;

        // Calculate new end time
        const newDuration = newHeight / 80; // Convert pixels to hours
        const newEndAt = new Date(startDate);
        const extraHours = Math.floor(newDuration);
        const extraMinutes = Math.round((newDuration - extraHours) * 60);

        newEndAt.setHours(startDate.getHours() + extraHours);
        newEndAt.setMinutes(startDate.getMinutes() + extraMinutes);

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
          updateEvent(id, pendingUpdateRef.current)
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
  }, [id, startDate, updateEvent, hideModal]);

  // Event dragging - completely rewired for performance
  useEffect(() => {
    const contentEl = contentRef.current;
    const cardEl = cardRef.current;
    const cellEl = document.querySelector('.calendar-cell') as HTMLDivElement;

    if (!contentEl || !cardEl || !cellEl) return;

    let startX = 0;
    let startY = 0;
    let initialCardPosition = { top: 0, left: 0 };
    let columnWidth = 0;
    let hasMoved = false;

    const handleMouseDown = (e: MouseEvent) => {
      e.stopPropagation();

      // Don't allow multiple operations
      if (isResizingRef.current || isDraggingRef.current) return;

      // Record initial positions
      startX = e.clientX;
      startY = e.clientY;

      // Record initial card position
      initialCardPosition = {
        top: cardEl.offsetTop,
        left: cardEl.offsetLeft,
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
        const newTop = snapToGrid(initialCardPosition.top + dy, 20); // 20px vertical grid
        const newLeft = snapToGrid(initialCardPosition.left + dx, columnWidth); // column width grid

        // Keep track of the current position to avoid redundant updates
        const positionChanged =
          newTop !== currentPositionRef.current.top ||
          newLeft !== currentPositionRef.current.left;

        if (positionChanged) {
          // Update visual position immediately (with GPU acceleration)
          cardEl.style.transform = `translate3d(${newLeft - initialCardPosition.left}px, ${newTop - initialCardPosition.top}px, 0)`;

          // Store the current position
          currentPositionRef.current = { top: newTop, left: newLeft };

          // Calculate new times based on position
          const newDateIdx = Math.floor(newLeft / columnWidth);
          const newStartHour = Math.floor(newTop / 80);
          const newStartMinute = Math.round(((newTop % 80) / 80) * 60);

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
          newEndAt.setTime(
            newStartAt.getTime() + (endDate.getTime() - startDate.getTime())
          );

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
          if (cardEl) {
            const currentTop = currentPositionRef.current.top;
            const currentLeft = currentPositionRef.current.left;

            // Reset transform and set direct position
            cardEl.style.transform = '';
            cardEl.style.top = `${currentTop}px`;
            cardEl.style.left = `${currentLeft}px`;

            // Ensure final update is sent
            if (pendingUpdateRef.current) {
              setIsSyncing(true);
              updateEvent(id, pendingUpdateRef.current)
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
            openModal(id);
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
  }, [id, startDate, endDate, dates, updateEvent, hideModal, openModal]);

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
        bg: 'bg-dynamic-blue/10',
        border: 'border-dynamic-blue/50',
        text: 'text-dynamic-blue',
      },
      RED: {
        bg: 'bg-dynamic-red/10',
        border: 'border-dynamic-red/50',
        text: 'text-dynamic-red',
      },
      GREEN: {
        bg: 'bg-dynamic-green/10',
        border: 'border-dynamic-green/50',
        text: 'text-dynamic-green',
      },
      YELLOW: {
        bg: 'bg-dynamic-yellow/10',
        border: 'border-dynamic-yellow/50',
        text: 'text-dynamic-yellow',
      },
      PURPLE: {
        bg: 'bg-dynamic-purple/10',
        border: 'border-dynamic-purple/50',
        text: 'text-dynamic-purple',
      },
      PINK: {
        bg: 'bg-dynamic-pink/10',
        border: 'border-dynamic-pink/50',
        text: 'text-dynamic-pink',
      },
      ORANGE: {
        bg: 'bg-dynamic-orange/10',
        border: 'border-dynamic-orange/50',
        text: 'text-dynamic-orange',
      },
      INDIGO: {
        bg: 'bg-dynamic-indigo/10',
        border: 'border-dynamic-indigo/50',
        text: 'text-dynamic-indigo',
      },
      CYAN: {
        bg: 'bg-dynamic-cyan/10',
        border: 'border-dynamic-cyan/50',
        text: 'text-dynamic-cyan',
      },
      GRAY: {
        bg: 'bg-dynamic-gray/10',
        border: 'border-dynamic-gray/50',
        text: 'text-dynamic-gray',
      },
    };

    return colorStyles[normalizedColor] || colorStyles.BLUE;
  };

  const { bg, border, text } = getEventStyles()!;

  // Use the visual state for UI rendering
  const { isDragging, isResizing } = visualState;

  return (
    <div
      ref={cardRef}
      id={`event-${id}`}
      className={cn(
        'pointer-events-auto absolute max-w-none overflow-hidden rounded border select-none',
        'hover:ring-2 hover:ring-primary/50 focus:outline-none',
        'group relative',
        {
          'opacity-80': isDragging || isResizing, // Lower opacity during interaction
          'animate-pulse': isSyncing, // Pulse animation during sync
        },
        bg,
        border,
        text
      )}
      style={{
        transition:
          isDragging || isResizing
            ? 'none' // No transition during interaction
            : 'opacity 300ms ease-in-out',
        zIndex: isHovering || isDragging || isResizing ? 50 : 1,
        willChange: isDragging || isResizing ? 'transform' : 'auto', // GPU acceleration
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      tabIndex={0}
      onClick={(e) => {
        // Only open modal if we haven't just finished dragging or resizing
        if (!wasDraggedRef.current && !wasResizedRef.current) {
          e.stopPropagation();
          openModal(id);
        }

        // Reset state flags
        wasDraggedRef.current = false;
        wasResizedRef.current = false;
      }}
      role="button"
      aria-label={`Event: ${title || 'Untitled event'}`}
    >
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
          openModal(id);
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
          'h-full p-1 text-left text-sm select-none',
          duration <= 0.25 && 'text-xs'
        )}
      >
        <div className="line-clamp-2 font-medium">
          {title || 'Untitled event'}
        </div>
        {duration > 0.5 && description && (
          <div className="line-clamp-2 text-xs opacity-80">{description}</div>
        )}
      </div>

      <div
        ref={handleRef}
        className={cn(
          'absolute inset-x-0 bottom-0 cursor-s-resize hover:bg-primary/20',
          duration <= 0.25 ? 'h-1.5' : 'h-2'
        )}
        aria-label="Resize event"
      />
    </div>
  );
}
