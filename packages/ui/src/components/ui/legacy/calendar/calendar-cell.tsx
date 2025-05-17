import { useCalendar } from '../../../../hooks/use-calendar';
import { HOUR_HEIGHT } from './config';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useCallback, useEffect, useRef, useState } from 'react';

dayjs.extend(timezone);

interface DragPreviewProps {
  startDate: Date;
  endDate: Date;
  top: number;
  height: number;
  isReversed: boolean;
}

const DragPreview = ({
  startDate,
  endDate,
  top,
  height,
  isReversed,
}: DragPreviewProps) => {
  // Calculate duration in minutes
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationMinutes = Math.round(durationMs / (1000 * 60));

  return (
    <div
      className="bg-primary/30 border-primary absolute left-1 right-1 z-10 overflow-hidden rounded-md border shadow-md transition-all"
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 20)}px`,
      }}
    >
      <div
        className={cn(
          'flex h-full w-full flex-col justify-between p-1',
          height > 40 ? 'opacity-100' : 'opacity-0',
          'transition-opacity'
        )}
      >
        <div className="text-primary-foreground bg-primary/50 self-start rounded px-1 text-xs font-semibold">
          {format(startDate, 'h:mm a')}
        </div>
        <div className="text-primary-foreground bg-primary/50 self-end rounded px-1 text-xs font-semibold">
          {format(endDate, 'h:mm a')}
        </div>
      </div>
      <div
        className={cn(
          'bg-primary absolute right-1 whitespace-nowrap rounded px-2 py-1 text-xs font-semibold text-white',
          height > 60 ? 'top-1' : isReversed ? '-bottom-6' : '-top-6'
        )}
      >
        {durationMinutes < 60
          ? `${durationMinutes}min`
          : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}min` : ''}`}
      </div>
    </div>
  );
};

interface CalendarCellProps {
  date: string;
  hour: number;
}

export const CalendarCell = ({ date, hour }: CalendarCellProps) => {
  const { addEmptyEvent, addEmptyEventWithDuration, settings } = useCalendar();
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
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
  const [hoveredSlot, setHoveredSlot] = useState<'hour' | 'half-hour' | null>(
    null
  );
  const [showBothLabels, setShowBothLabels] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipLocked, setTooltipLocked] = useState(false);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const cursorPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const id = `cell-${date}-${hour}`;
  const tooltipId = `calendar-tooltip-${id}`;

  // Format time for display - only show when hovering
  const formatTime = (hour: number, minute: number = 0) => {
    const base = dayjs(date);
    const dateTz = tz === 'auto' ? base : base.tz(tz);
    return dateTz
      .hour(hour)
      .minute(minute)
      .format(settings?.appearance?.timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
  };

  const handleCreateEvent = (midHour?: boolean) => {
    const base = dayjs(date);
    const dateTz = tz === 'auto' ? base : base.tz(tz);
    const newDate = dateTz
      .hour(hour)
      .minute(midHour ? 30 : 0)
      .second(0)
      .millisecond(0);
    const correctDate = newDate.add(1, 'day');
    addEmptyEvent(correctDate.toDate());
  };

  // Round to 15 minute intervals
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

  // Handle mouse down event - start drag
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      // Only handle left click
      if (e.button !== 0) return;

      e.preventDefault();

      // Initialize drag start information
      const newDate = new Date(date);
      const [hours, minutes] = yToTime(e.clientY);
      newDate.setHours(hours, minutes, 0, 0);

      const roundedDate = roundToNearest15Minutes(newDate);
      dragStartRef.current = {
        date: roundedDate,
        y: e.clientY,
      };

      setIsDragging(true);
      setDragPreview({
        startDate: roundedDate,
        endDate: roundedDate,
        top: e.clientY - cellRef.current!.getBoundingClientRect().top,
        height: 4,
        isReversed: false,
      });

      document.body.style.cursor = 'ns-resize';
      document.body.classList.add('select-none');
    },
    [date, yToTime]
  );

  // Handle mouse move event - update drag preview
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current || !cellRef.current) return;

      e.preventDefault();

      const cellRect = cellRef.current.getBoundingClientRect();
      const startY = dragStartRef.current.y - cellRect.top;
      const currentY = e.clientY - cellRect.top;

      // Calculate top and height
      const top = Math.min(startY, currentY);
      const height = Math.abs(currentY - startY);

      // Update time labels
      const startDate = dragStartRef.current.date;
      const [endHours, endMinutes] = yToTime(e.clientY);
      const endDate = new Date(date);
      endDate.setHours(endHours, endMinutes, 0, 0);
      const roundedEndDate = roundToNearest15Minutes(endDate);

      // Determine which date is actually start and end
      const isReversed = endDate.getTime() < startDate.getTime();
      const actualStartDate = isReversed ? roundedEndDate : startDate;
      const actualEndDate = isReversed ? startDate : roundedEndDate;

      // Update preview state
      setDragPreview({
        startDate: actualStartDate,
        endDate: actualEndDate,
        top,
        height,
        isReversed,
      });
    },
    [isDragging, date, yToTime]
  );

  // Handle mouse up event - create event
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;

      e.preventDefault();
      setIsDragging(false);

      // Reset cursor
      document.body.style.cursor = '';
      document.body.classList.remove('select-none');

      // Calculate event duration
      const [endHours, endMinutes] = yToTime(e.clientY);
      const endDate = new Date(date);
      endDate.setHours(endHours, endMinutes, 0, 0);
      const roundedEndDate = roundToNearest15Minutes(endDate);

      // Minimum height should be 15 minutes
      const startDate = dragStartRef.current.date;
      const duration = Math.abs(roundedEndDate.getTime() - startDate.getTime());

      // Create event if drag is significant (> 5 minutes)
      if (duration > 5 * 60 * 1000) {
        const eventStart =
          startDate.getTime() <= roundedEndDate.getTime()
            ? startDate
            : roundedEndDate;
        const eventEnd =
          startDate.getTime() <= roundedEndDate.getTime()
            ? roundedEndDate
            : startDate;

        // Set minimum duration to 15 minutes
        if (eventEnd.getTime() - eventStart.getTime() < 15 * 60 * 1000) {
          const updatedEndDate = new Date(eventStart);
          updatedEndDate.setMinutes(eventStart.getMinutes() + 15);
          addEmptyEventWithDuration(eventStart, updatedEndDate);
        } else {
          // Create new event with custom duration
          addEmptyEventWithDuration(eventStart, eventEnd);
        }
      }

      // Clear preview
      setDragPreview(null);
      dragStartRef.current = null;
    },
    [isDragging, date, yToTime, addEmptyEventWithDuration]
  );

  // Helper to handle mouse enter for each slot
  const handleSlotMouseEnter = (slot: 'hour' | 'half-hour') => {
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
  const updateTooltipPosition = () => {
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${cursorPosRef.current.x}px`;
      tooltipRef.current.style.top = `${cursorPosRef.current.y}px`;
    }
    rafRef.current = null;
  };

  const handleSlotMouseMove = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    const offset = 8;
    const flipOffset = 16;
    let x = e.clientX + offset;
    let y = e.clientY + offset;
    const tooltipWidth = 200;
    const tooltipHeight = 40;
    const padding = 8;
    if (x + tooltipWidth > window.innerWidth - padding) {
      x = e.clientX - tooltipWidth - flipOffset;
    }
    if (y + tooltipHeight > window.innerHeight - padding) {
      y = e.clientY - tooltipHeight - flipOffset;
    }
    cursorPosRef.current = { x, y };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(updateTooltipPosition);
    }
    if (tooltipLocked) {
      setShowTooltip(true);
    }
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
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      cell.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    return () => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
      {showBothLabels ? (
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
      ) : null}

      {/* Drag preview overlay */}
      {dragPreview && <DragPreview {...dragPreview} />}

      {/* Full cell clickable area */}
      <button
        className="absolute inset-0 h-1/2 w-full cursor-pointer focus:outline-none"
        onClick={() => handleCreateEvent()}
        onMouseEnter={() => handleSlotMouseEnter('hour')}
        onMouseLeave={handleSlotMouseLeave}
        onMouseMove={handleSlotMouseMove}
        onFocus={() => handleSlotFocus('hour')}
        onBlur={handleSlotBlur}
        aria-describedby={tooltipId}
      />
      {/* Half-hour marker */}
      <div className="border-border/30 absolute left-0 right-0 top-1/2 border-t border-dashed" />
      {/* Half-hour clickable area */}
      <button
        className="absolute inset-x-0 top-1/2 h-1/2 cursor-pointer focus:outline-none"
        onClick={() => handleCreateEvent(true)}
        onMouseEnter={() => handleSlotMouseEnter('half-hour')}
        onMouseLeave={handleSlotMouseLeave}
        onMouseMove={handleSlotMouseMove}
        onFocus={() => handleSlotFocus('half-hour')}
        onBlur={handleSlotBlur}
        aria-describedby={tooltipId}
      />
      {/* Custom tooltip near cursor, only one at a time, fixed position, only after 1s */}
      {showTooltip && hoveredSlot && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          aria-live="polite"
          className="pointer-events-none rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{
            position: 'fixed',
            left: cursorPosRef.current.x,
            top: cursorPosRef.current.y,
            minWidth: 120,
            maxWidth: 200,
            zIndex: 10000,
            whiteSpace: 'nowrap',
          }}
        >
          {`Create an event at ${hoveredSlot === 'hour' ? formatTime(hour) : formatTime(hour, 30)}`}
        </div>
      )}
    </div>
  );
};
