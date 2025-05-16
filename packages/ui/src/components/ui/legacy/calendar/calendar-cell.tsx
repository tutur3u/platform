import { useCalendar } from '../../../../hooks/use-calendar';
import { HOUR_HEIGHT } from './config';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useCallback, useEffect, useRef, useState } from 'react';

dayjs.extend(timezone);

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
  const previewRef = useRef<HTMLDivElement | null>(null);
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

  // Add a stable tooltip id for aria-describedby
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

      // Create preview element
      const preview = document.createElement('div');
      preview.className =
        'absolute left-1 right-1 bg-primary/30 border border-primary z-10 rounded-md shadow-md transition-all overflow-hidden';
      preview.style.top = `${e.clientY - cellRef.current!.getBoundingClientRect().top}px`;
      preview.style.height = '4px';

      // Add a container for time information
      const infoContainer = document.createElement('div');
      infoContainer.className =
        'w-full h-full flex flex-col justify-between p-1 opacity-0 transition-opacity';
      preview.appendChild(infoContainer);

      // Add start time label
      const startTimeLabel = document.createElement('div');
      startTimeLabel.className =
        'text-xs font-semibold text-primary-foreground bg-primary/50 px-1 rounded self-start';
      startTimeLabel.textContent = format(roundedDate, 'h:mm a');
      infoContainer.appendChild(startTimeLabel);

      // Add duration label
      const durationLabel = document.createElement('div');
      durationLabel.className =
        'text-xs font-semibold text-white px-2 py-1 rounded bg-primary absolute right-1 top-1 whitespace-nowrap';
      durationLabel.textContent = '0min';
      preview.appendChild(durationLabel);

      // Add end time label
      const endTimeLabel = document.createElement('div');
      endTimeLabel.className =
        'text-xs font-semibold text-primary-foreground bg-primary/50 px-1 rounded self-end';
      endTimeLabel.textContent = format(roundedDate, 'h:mm a');
      infoContainer.appendChild(endTimeLabel);

      cellRef.current!.appendChild(preview);
      previewRef.current = preview;

      document.body.style.cursor = 'ns-resize';
      document.body.classList.add('select-none');
    },
    [date, yToTime]
  );

  // Handle mouse move event - update drag preview
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current || !previewRef.current) return;

      e.preventDefault();

      const cellRect = cellRef.current!.getBoundingClientRect();
      const startY = dragStartRef.current.y - cellRect.top;
      const currentY = e.clientY - cellRect.top;

      // Calculate top and height
      const top = Math.min(startY, currentY);
      const height = Math.abs(currentY - startY);

      // Update preview element
      previewRef.current.style.top = `${top}px`;
      previewRef.current.style.height = `${Math.max(height, 20)}px`;

      // Show info container if height is sufficient
      const infoContainer = previewRef.current.querySelector('div');
      if (infoContainer && height > 40) {
        infoContainer.classList.remove('opacity-0');
        infoContainer.classList.add('opacity-100');
      } else if (infoContainer) {
        infoContainer.classList.remove('opacity-100');
        infoContainer.classList.add('opacity-0');
      }

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

      // Calculate duration in minutes
      const durationMs = actualEndDate.getTime() - actualStartDate.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));

      // Find the time labels
      const startTimeLabel =
        previewRef.current.querySelectorAll('div > div')[0];
      const durationLabel = previewRef.current.querySelectorAll('div')[1];
      const endTimeLabel = previewRef.current.querySelectorAll('div > div')[1];

      if (startTimeLabel && endTimeLabel && durationLabel) {
        startTimeLabel.textContent = format(actualStartDate, 'h:mm a');
        endTimeLabel.textContent = format(actualEndDate, 'h:mm a');

        // Display different formats based on duration
        if (durationMinutes < 60) {
          durationLabel.textContent = `${durationMinutes}min`;
        } else {
          const hours = Math.floor(durationMinutes / 60);
          const minutes = durationMinutes % 60;
          durationLabel.textContent =
            minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
        }

        // Position the duration label based on preview height
        if (height > 60) {
          durationLabel.classList.remove('top-1', '-top-6', '-bottom-6');
          durationLabel.classList.add('top-1');
        } else if (isReversed) {
          durationLabel.classList.remove('top-1', '-top-6', '-bottom-6');
          durationLabel.classList.add('-bottom-6');
        } else {
          durationLabel.classList.remove('top-1', '-top-6', '-bottom-6');
          durationLabel.classList.add('-top-6');
        }
      }
    },
    [isDragging, date, yToTime]
  );

  // Handle mouse up event - create event
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;

      e.preventDefault();
      setIsDragging(false);

      // Remove preview
      if (previewRef.current && cellRef.current) {
        try {
          cellRef.current.removeChild(previewRef.current);
        } catch (e) {
          // The preview may have been moved to another cell
          // Find it in the document and remove it
          const preview = document.querySelector(`[id^="event-preview-"]`);
          if (preview && preview.parentElement) {
            preview.parentElement.removeChild(preview);
          }
        }
        previewRef.current = null;
      }

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

      // Always reset drag state
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

      // Clean up any remaining preview
      if (previewRef.current && cellRef.current) {
        try {
          cellRef.current.removeChild(previewRef.current);
        } catch (e) {
          // Ignore if already removed
        }
        previewRef.current = null;
      }
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
        hour !== 0 && 'border-t border-border/30',
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
          <span className="absolute top-2 left-2 text-xs font-medium text-muted-foreground/70">
            {formatTime(hour)}
          </span>
          <span className="absolute bottom-2 left-2 text-xs font-medium text-muted-foreground/70">
            {formatTime(hour, 30)}
          </span>
        </>
      ) : hoveredSlot === 'hour' ? (
        <span className="absolute top-2 left-2 text-xs font-medium text-muted-foreground/70">
          {formatTime(hour)}
        </span>
      ) : hoveredSlot === 'half-hour' ? (
        <span className="absolute bottom-2 left-2 text-xs font-medium text-muted-foreground/70">
          {formatTime(hour, 30)}
        </span>
      ) : null}
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
      <div className="absolute top-1/2 right-0 left-0 border-t border-dashed border-border/30" />
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
