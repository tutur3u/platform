import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import { HOUR_HEIGHT } from './config';

dayjs.extend(timezone);

interface DragPreviewProps {
  startDate: Date;
  endDate: Date;
  top: number;
  height: number;
  isReversed: boolean;
}

const DragPreview = ({ startDate, endDate, top, height }: DragPreviewProps) => {
  // Calculate duration in minutes
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationMinutes = Math.round(durationMs / (1000 * 60));

  // Get color styles for the preview
  const { bg, border, text } = getEventStyles('BLUE');

  return (
    <div
      className={cn(
        'absolute left-1 right-1 rounded-l rounded-r-md border-l-2 transition-colors duration-300',
        'group transition-all hover:ring-1 focus:outline-none',
        'transform shadow-md', // Subtle transform during interaction
        border,
        text,
        bg
      )}
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 20)}px`,
        transition: 'none', // No transition during interaction
        willChange: 'transform', // GPU acceleration
        zIndex: 11, // Higher z-index to stay above all other elements
        pointerEvents: 'none', // Prevent interaction with preview
      }}
    >
      <div
        className={cn(
          'flex h-full w-full flex-col justify-between p-1',
          height > 40 ? 'opacity-100' : 'opacity-0',
          'transition-opacity'
        )}
      >
        <div className="absolute left-2 text-left text-xs font-semibold">
          {format(startDate, 'h:mm a')}
        </div>
        <div className="absolute bottom-1 left-2 text-left text-xs font-semibold">
          {format(endDate, 'h:mm a')}
        </div>
      </div>
      <div
        className={cn(
          'pointer-events-none absolute whitespace-nowrap rounded-md text-xs font-semibold',
          // More compact styling for short durations
          height < 60
            ? 'right-1 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[10px]'
            : 'right-2 top-2 px-1.5 py-0.5',
          'bg-blue-500 text-white'
        )}
        style={{
          maxWidth: 'calc(100% - 8px)', // Tighter max width
          minWidth: 24, // Smaller min width for short durations
          textAlign: 'right',
          transform: height < 60 ? 'translateY(-50%)' : 'none',
        }}
      >
        {durationMinutes < 60
          ? `${durationMinutes <= 0 ? 15 : durationMinutes}m`
          : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ''}`}
      </div>
    </div>
  );
};

interface CalendarCellProps {
  date: string;
  hour: number;
}

// Find the scrollable parent container
const findScrollContainer = (el: HTMLElement | null): HTMLElement | null => {
  let node = el;
  while (node) {
    if (node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
};

const GRID_SNAP = HOUR_HEIGHT / 4; // 15 minutes per grid

type TooltipPos = { x: number; y: number; arrowDirection: 'right' | 'left' | 'down' | 'up' };

export const CalendarCell = ({ date, hour }: CalendarCellProps) => {
  const {
    addEmptyEvent,
    addEmptyEventWithDuration,
    settings,
    isDragging,
    setIsDragging,
  } = useCalendar();
  const [isHovering, setIsHovering] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ date: Date; y: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    startDate: Date;
    endDate: Date;
    top: number;
    height: number;
    isReversed: boolean;
  } | null>(null);
  const tz = settings?.timezone?.timezone;
  const [hoveredSlot, setHoveredSlot] = useState<
    'hour' | 'half-hour' | number | null
  >(null);
  const [showBothLabels, setShowBothLabels] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipLocked, setTooltipLocked] = useState(false);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // --- Google Calendar-like Drag & Auto-Scroll ---
  const autoScrollRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  // Store drag start Y relative to container and cell top in container
  const dragStartYInContainer = useRef<number>(0);
  const cellTopInContainer = useRef<number>(0);
  // Add refs for tooltip position and animation frame
  const tooltipPosRef = useRef<TooltipPos>({ x: 0, y: 0, arrowDirection: 'right' });
  const rafId = useRef<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ x: 0, y: 0, arrowDirection: 'right' });

  const id = `cell-${date}-${hour}`;
  const tooltipId = `calendar-tooltip-${id}`;

  // Format time for display - only show when hovering
  const formatTime = (hour: number, minute: number = 0) => {
    const base = dayjs(date + 'T00:00:00');
    const dateTz = tz === 'auto' ? base.local() : base.tz(tz);
    return dateTz
      .hour(hour)
      .minute(minute)
      .format(settings?.appearance?.timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
  };

  // Helper to get a Date object for a given hour/minute, timezone-aware
  const getCellDate = (hour: number, minute: number = 0) => {
    const base = dayjs(date + 'T00:00:00');
    const dateTz = tz === 'auto' ? base.local() : base.tz(tz);
    return dateTz.hour(hour).minute(minute).second(0).millisecond(0).toDate();
  };

  const handleCreateEvent = (midHour?: boolean) => {
    // Always use timezone-aware date construction
    const eventDate = getCellDate(hour, midHour ? 30 : 0);
    // Clear drag state before opening modal
    setIsDragging(false);
    setDragPreview(null);
    addEmptyEvent(eventDate);
  };

  // Improved rounding for Google Calendar parity
  const roundToNearest15Minutes = (date: Date): Date => {
    const minutes = date.getMinutes();
    const remainder = minutes % 15;
    const roundedMinutes =
      remainder < 7.5 ? minutes - remainder : minutes + (15 - remainder);
    const roundedDate = new Date(date);
    roundedDate.setMinutes(roundedMinutes);
    roundedDate.setSeconds(0);
    roundedDate.setMilliseconds(0);
    return roundedDate;
  };

  // Convert Y coordinate to time (hour and minutes)
  const yToTime = useCallback(
    (y: number): [number, number] => {
      if (!cellRef.current) return [hour, 0];
      const cellRect = cellRef.current.getBoundingClientRect();
      const relativeY = y - cellRect.top;
      const hourFraction = relativeY / HOUR_HEIGHT;
      const hours = Math.floor(hourFraction) + hour;
      const minutes = Math.round(
        (hourFraction - Math.floor(hourFraction)) * 60
      );
      return [hours, minutes];
    },
    [hour]
  );

  // Auto-scroll logic
  const autoScroll = useCallback((clientY: number) => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const rect = container.getBoundingClientRect();
    const edgeThreshold = 60; // px from edge to start scrolling
    const scrollSpeed = 18; // px per frame
    let scrollDelta = 0;
    if (clientY < rect.top + edgeThreshold) {
      scrollDelta = -scrollSpeed;
    } else if (clientY > rect.bottom - edgeThreshold) {
      scrollDelta = scrollSpeed;
    }
    if (scrollDelta !== 0) {
      container.scrollTop += scrollDelta;
      autoScrollRef.current = requestAnimationFrame(() => autoScroll(clientY));
    } else {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    }
  }, []);

  // Update drag start to use container-relative coordinates
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      // Clear any existing previews when starting a new drag
      setDragPreview(null);
      const [hours, minutes] = yToTime(e.clientY);
      const newDate = getCellDate(hours, minutes);
      const roundedDate = roundToNearest15Minutes(newDate);
      dragStartRef.current = {
        date: roundedDate,
        y: e.clientY,
      };
      if (!scrollContainerRef.current && cellRef.current) {
        scrollContainerRef.current = findScrollContainer(cellRef.current);
      }
      const container = scrollContainerRef.current;
      if (container && cellRef.current) {
        const containerRect = container.getBoundingClientRect();
        const cellRect = cellRef.current.getBoundingClientRect();
        dragStartYInContainer.current =
          e.clientY + container.scrollTop - containerRect.top;
        cellTopInContainer.current =
          cellRect.top + container.scrollTop - containerRect.top;
      }
      // Set dragging state immediately
      setIsDragging(true);
      document.body.style.cursor = 'ns-resize';
      document.body.classList.add('select-none');
    },
    [yToTime, getCellDate, setIsDragging]
  );

  // Enhanced mouse move for Google Calendar-like drag
  const enhancedHandleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragStartRef.current || !cellRef.current) return;
      e.preventDefault();
      // Always call autoScroll on every mousemove during drag
      if (isDragging) {
        autoScroll(e.clientY);
      }
      const container = scrollContainerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      // Calculate current Y in container
      const currentYInContainer =
        e.clientY + container.scrollTop - containerRect.top;
      const startYInContainer = dragStartYInContainer.current;
      const cellTop = cellTopInContainer.current;
      // Snap both start and current Y to the 15-minute grid
      const snapToGrid = (value: number) =>
        Math.round(value / GRID_SNAP) * GRID_SNAP;
      const snappedStartY = snapToGrid(startYInContainer - cellTop);
      const snappedCurrentY = snapToGrid(currentYInContainer - cellTop);
      const top = Math.min(snappedStartY, snappedCurrentY);
      const height = Math.abs(snappedCurrentY - snappedStartY);
      // Calculate the corresponding time for the snapped Y
      const getTimeFromY = (y: number) => {
        const hourFloat = y / HOUR_HEIGHT;
        const hours = Math.floor(hourFloat) + hour;
        const minutes = Math.round((hourFloat - Math.floor(hourFloat)) * 60);
        return getCellDate(hours, minutes);
      };
      const startDate = getTimeFromY(snappedStartY);
      const endDate = getTimeFromY(snappedCurrentY);
      const roundedStartDate = roundToNearest15Minutes(startDate);
      const roundedEndDate = roundToNearest15Minutes(endDate);

      if (!isDragging) return;
      const isReversed = roundedEndDate.getTime() < roundedStartDate.getTime();
      const actualStartDate = isReversed ? roundedEndDate : roundedStartDate;
      const actualEndDate = isReversed ? roundedStartDate : roundedEndDate;
      setDragPreview({
        startDate: actualStartDate,
        endDate: actualEndDate,
        top,
        height,
        isReversed,
      });
    },
    [isDragging, yToTime, getCellDate, autoScroll]
  );

  // Setup scroll container ref on mount
  useEffect(() => {
    if (!scrollContainerRef.current && cellRef.current) {
      scrollContainerRef.current = findScrollContainer(cellRef.current);
    }
  }, []);

  // Listen for scroll events during drag to update preview
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!isDragging) return;
    const onScroll = () => {
      // Simulate a mousemove event to update preview
      const fakeEvent = {
        ...window.event,
        pageY: window.event ? (window.event as MouseEvent).pageY : 0,
        clientY: window.event ? (window.event as MouseEvent).clientY : 0,
      } as MouseEvent;
      enhancedHandleMouseMove(fakeEvent);
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, [isDragging, enhancedHandleMouseMove]);

  // Replace mousemove event listener with enhanced version
  useEffect(() => {
    document.addEventListener('mousemove', enhancedHandleMouseMove);
    return () => {
      document.removeEventListener('mousemove', enhancedHandleMouseMove);
      if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
    };
  }, [enhancedHandleMouseMove]);

  // Stop auto-scroll on drag end
  useEffect(() => {
    if (!isDragging && autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, [isDragging]);

  // Handle mouse up event - create event
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      e.preventDefault();
      document.body.style.cursor = '';
      document.body.classList.remove('select-none');
      // If we weren't dragging, treat as a click
      if (!isDragging) {
        const [hours, minutes] = yToTime(e.clientY);
        const eventDate = getCellDate(hours, minutes);
        const roundedDate = roundToNearest15Minutes(eventDate);
        setDragPreview(null);
        setIsDragging(false);
        addEmptyEvent(roundedDate);
        dragStartRef.current = null;
        return;
      }
      setIsDragging(false);
      // Calculate event duration
      const container = scrollContainerRef.current;
      if (!container || !cellRef.current) return;
      const containerRect = container.getBoundingClientRect();
      const currentYInContainer =
        e.clientY + container.scrollTop - containerRect.top;
      const startYInContainer = dragStartYInContainer.current;
      const cellTop = cellTopInContainer.current;
      const snapToGrid = (value: number) =>
        Math.round(value / GRID_SNAP) * GRID_SNAP;
      const snappedStartY = snapToGrid(startYInContainer - cellTop);
      const snappedCurrentY = snapToGrid(currentYInContainer - cellTop);
      const getTimeFromY = (y: number) => {
        const hourFloat = y / HOUR_HEIGHT;
        const hours = Math.floor(hourFloat) + hour;
        const minutes = Math.round((hourFloat - Math.floor(hourFloat)) * 60);
        return getCellDate(hours, minutes);
      };
      let eventStart = roundToNearest15Minutes(getTimeFromY(snappedStartY));
      let eventEnd = roundToNearest15Minutes(getTimeFromY(snappedCurrentY));
      // Always order start and end
      if (eventEnd.getTime() < eventStart.getTime()) {
        [eventStart, eventEnd] = [eventEnd, eventStart];
      }
      let duration = Math.abs(eventEnd.getTime() - eventStart.getTime());
      // If duration is 0, set to 15 minutes
      if (duration === 0) {
        eventEnd = new Date(eventStart.getTime() + 15 * 60 * 1000);
        duration = 15 * 60 * 1000;
      }
      // --- Event time range validation ---
      // Cap event duration to 24 hours
      const MAX_EVENT_DURATION = 24 * 60 * 60 * 1000;
      if (duration > MAX_EVENT_DURATION) {
        eventEnd = new Date(eventStart.getTime() + MAX_EVENT_DURATION);
        duration = MAX_EVENT_DURATION;
      }
      // If event spans midnight but is less than 12 hours, cap at midnight
      const startDay = eventStart.getDate();
      const endDay = eventEnd.getDate();
      if (startDay !== endDay && duration < 12 * 60 * 60 * 1000) {
        const midnight = new Date(eventStart);
        midnight.setHours(23, 59, 59, 999);
        eventEnd = midnight;
        duration = eventEnd.getTime() - eventStart.getTime();
      }
      // Only create if duration >= 15 minutes
      if (duration >= 15 * 60 * 1000) {
        setDragPreview(null);
        addEmptyEventWithDuration(eventStart, eventEnd);
      } else {
        setDragPreview(null);
      }
      dragStartRef.current = null;
    },
    [
      isDragging,
      yToTime,
      getCellDate,
      addEmptyEvent,
      addEmptyEventWithDuration,
      setIsDragging,
    ]
  );

  // Helper to handle mouse enter for each slot
  const handleSlotMouseEnter = (slot: 'hour' | 'half-hour' | number) => {
    setHoveredSlot(slot);
    if (!tooltipLocked) {
      setShowBothLabels(false);
      setShowTooltip(false);
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => {
        setShowBothLabels(true);
        setShowTooltip(true);
        setTooltipLocked(true);
      }, 1000);
    } else {
      setShowTooltip(true);
    }
  };

  // Helper to handle mouse leave for each slot
  const handleSlotMouseLeave = () => {
    setHoveredSlot(null);
    // Do not reset tooltip/labels here; only reset on cell leave
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  };

  // Throttled tooltip position update

  // Helper to determine if a given minute is a 15-minute interval
  const isQuarterHour = (minute: number) => minute % 15 === 0;

  // Update mouse move/hover logic to show tooltip for every 15-minute cell
  const handleSlotMouseMove = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    slot: 'hour' | 'half-hour' | number
  ) => {
    if (isDragging) return;
    setIsHovering(true);
    // If slot is a number, it's a 15-minute cell
    if (typeof slot === 'number' && isQuarterHour(slot)) {
      setHoveredSlot(slot);
    } else {
      setHoveredSlot(slot);
    }
    const offset = 8;
    const tooltipWidth = 200;
    const tooltipHeight = 40;
    const padding = 8;
    let x = e.clientX + offset;
    let y = e.clientY + offset;
    let arrowDirection: 'right' | 'left' | 'down' | 'up' = 'right';

    // Flip horizontally if overflowing right
    if (x + tooltipWidth > window.innerWidth - padding) {
      x = e.clientX - tooltipWidth - offset + 30;
      arrowDirection = 'left';
      if (x < padding) x = window.innerWidth - tooltipWidth - padding;
    }
    // Flip vertically if overflowing bottom
    if (y + tooltipHeight > window.innerHeight - padding) {
      y = e.clientY - tooltipHeight - offset + 30;
      arrowDirection = 'up';
      if (y < padding) y = window.innerHeight - tooltipHeight - padding;
    }
    // Clamp to viewport just in case
    x = Math.max(padding, Math.min(x, window.innerWidth - tooltipWidth - padding));
    y = Math.max(padding, Math.min(y, window.innerHeight - tooltipHeight - padding));

    tooltipPosRef.current = { x, y, arrowDirection };
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        setTooltipPos(tooltipPosRef.current);
        rafId.current = null;
      });
    }
    if (tooltipLocked) setShowTooltip(true);
  };

  // Handle leaving the cell: reset everything
  const handleCellMouseLeave = () => {
    setIsHovering(false);
    setHoveredSlot(null);
    setShowBothLabels(false);
    setShowTooltip(false);
    setTooltipLocked(false);
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  };

  const handleSlotFocus = (slot: 'hour' | 'half-hour') => {
    setHoveredSlot(slot);
    if (!tooltipLocked) {
      setShowBothLabels(false);
      setShowTooltip(false);
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => {
        setShowBothLabels(true);
        setShowTooltip(true);
        setTooltipLocked(true);
      }, 1000);
    } else {
      setShowTooltip(true);
    }
  };

  const handleSlotBlur = () => {
    setHoveredSlot(null);
    setShowTooltip(false);
  };

  // Set up event listeners
  useEffect(() => {
    const cell = cellRef.current;
    if (!cell) return;

    cell.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', enhancedHandleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      cell.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', enhancedHandleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, enhancedHandleMouseMove, handleMouseUp]);

  useEffect(() => {
    return () => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };
  }, []);

  // Hide tooltip on scroll or mouse leave
  useEffect(() => {
    const handleScroll = () => {
      setShowTooltip(false);
      setTooltipPos({ x: 0, y: 0, arrowDirection: 'right' });
    };
    const cell = cellRef.current;
    const handleMouseLeave = () => {
      setShowTooltip(false);
      setTooltipPos({ x: 0, y: 0, arrowDirection: 'right' });
    };
    if (cell) {
      cell.addEventListener('mouseleave', handleMouseLeave);
    }
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      if (cell) {
        cell.removeEventListener('mouseleave', handleMouseLeave);
      }
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <div
      id={id}
      ref={cellRef}
      className={cn(
        'calendar-cell relative transition-colors',
        hour !== 0 && 'border-border/30 border-t',
        isHovering ? 'bg-muted/20' : 'hover:bg-muted/10'
      )}
      style={{
        height: `${HOUR_HEIGHT}px`,
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={handleCellMouseLeave}
      data-hour={hour}
      data-date={date}
    >
      {/* Show only the hovered label before 1s, both after 1s */}
      {!isDragging &&
        (showBothLabels ? (
          <>
            <span className="text-muted-foreground/70 absolute left-2 top-2 text-xs font-medium">
              {formatTime(hour)}
            </span>
            <span className="text-muted-foreground/70 absolute bottom-2 left-2 text-xs font-medium">
              {formatTime(hour, 30)}
            </span>
          </>
        ) : hoveredSlot === 'hour' ? (
          <span className="text-muted-foreground/70 absolute left-2 top-2 text-xs font-medium">
            {formatTime(hour)}
          </span>
        ) : hoveredSlot === 'half-hour' ? (
          <span className="text-muted-foreground/70 absolute bottom-2 left-2 text-xs font-medium">
            {formatTime(hour, 30)}
          </span>
        ) : null)}

      {/* Drag preview overlay */}
      {dragPreview && <DragPreview {...dragPreview} />}

      {/* Full cell clickable area (hour) */}
      <button
        className="absolute inset-0 h-1/2 w-full cursor-pointer focus:outline-none"
        onClick={() => handleCreateEvent()}
        onMouseEnter={() => handleSlotMouseEnter('hour')}
        onMouseLeave={handleSlotMouseLeave}
        onMouseMove={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) =>
          handleSlotMouseMove(e as any, 'hour')
        }
        onFocus={() => handleSlotFocus('hour')}
        onBlur={handleSlotBlur}
        aria-describedby={tooltipId}
      />
      {/* 15-minute marker */}
      <button
        className="absolute left-0 right-0 top-1/4 h-1/4 w-full cursor-pointer focus:outline-none"
        style={{ background: 'transparent' }}
        onMouseEnter={() => handleSlotMouseEnter(15)}
        onMouseLeave={handleSlotMouseLeave}
        onMouseMove={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) =>
          handleSlotMouseMove(e as any, 15)
        }
        aria-describedby={tooltipId}
        tabIndex={-1}
      />
      {/* Half-hour marker */}
      <div className="border-border/30 absolute left-0 right-0 top-1/2 border-t border-dashed" />
      <button
        className="absolute inset-x-0 top-1/2 h-1/2 cursor-pointer focus:outline-none"
        onClick={() => handleCreateEvent(true)}
        onMouseEnter={() => handleSlotMouseEnter('half-hour')}
        onMouseLeave={handleSlotMouseLeave}
        onMouseMove={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) =>
          handleSlotMouseMove(e as any, 'half-hour')
        }
        onFocus={() => handleSlotFocus('half-hour')}
        onBlur={handleSlotBlur}
        aria-describedby={tooltipId}
      />
      {/* 45-minute marker */}
      <button
        className="absolute left-0 right-0 top-3/4 h-1/4 w-full cursor-pointer focus:outline-none"
        style={{ background: 'transparent' }}
        onMouseEnter={() => handleSlotMouseEnter(45)}
        onMouseLeave={handleSlotMouseLeave}
        onMouseMove={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) =>
          handleSlotMouseMove(e as any, 45)
        }
        aria-describedby={tooltipId}
        tabIndex={-1}
      />
      {/* Show tooltip for hovered slot (hour, half-hour, or 15-min) */}
      {showTooltip && hoveredSlot !== null && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          aria-live="polite"
          className="text-white pointer-events-none rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium shadow-lg transition-opacity duration-150 opacity-100 animate-fade-in"
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y,
            minWidth: 120,
            maxWidth: 200,
            zIndex: 10000,
            whiteSpace: 'nowrap',
            opacity: showTooltip ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          {`Create an event at ${
            typeof hoveredSlot === 'number'
              ? formatTime(hour, hoveredSlot)
              : hoveredSlot === 'hour'
                ? formatTime(hour)
                : formatTime(hour, 30)
          }`}
        </div>
      )}
    </div>
  );
};
