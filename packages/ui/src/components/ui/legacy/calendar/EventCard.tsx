import { useCalendar } from '../../../../hooks/use-calendar';
import { useDebouncedState } from '@mantine/hooks';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import { useEffect, useRef, useState } from 'react';

interface EventCardProps {
  dates: Date[];
  wsId: string;
  event: CalendarEvent;
}

export default function EventCard({ dates, event }: EventCardProps) {
  const { id, title, description, start_at, end_at, color = 'blue' } = event;

  const {
    getEventLevel: getLevel,
    updateEvent,
    hideModal,
    showModal,
  } = useCalendar();

  const startDate = moment(start_at).toDate();
  const endDate = moment(end_at).toDate();

  const startHours = startDate.getHours() + startDate.getMinutes() / 60;
  const endHours = endDate.getHours() + endDate.getMinutes() / 60;
  const duration =
    startHours > endHours ? 24 - startHours : endHours - startHours;
  const level = getLevel ? getLevel(id) : 0;

  const handleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useDebouncedState(false, 200);
  const [isResizing, setIsResizing] = useState(false);

  // Event positioning and sizing
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

    const observer = new ResizeObserver(() => {
      const columnWidth = cellEl.offsetWidth;
      const left = dateIdx * columnWidth + level * 12;
      const width = columnWidth - level * 12 - 4;

      cardEl.style.width = `${width}px`;
      cardEl.style.left = `${left}px`;
    });

    observer.observe(cellEl);

    cardEl.style.opacity = '1';
    cardEl.style.pointerEvents = 'all';

    return () => observer.disconnect();
  }, [id, startDate, duration, level, dates]);

  // Event resizing
  useEffect(() => {
    const rootEl = handleRef.current;
    const cardEl = rootEl?.parentElement;
    if (!rootEl || !cardEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      if (isDragging || isResizing) return;
      setIsResizing(true);
      hideModal();

      const startY = e.clientY;
      const startHeight = cardEl.offsetHeight;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        if (isDragging) return;

        const height = Math.round((startHeight + e.clientY - startY) / 20) * 20;
        if (height <= 20) return; // Minimum height

        cardEl.style.height = `${height - 4}px`;

        // Calculate new end time
        const newDuration = Math.round(height / 20) / 4;
        const newEndAt = new Date(startDate);
        const extraHours = Math.floor(newDuration);
        const extraMinutes = Math.round((newDuration - extraHours) * 60);

        newEndAt.setHours(startDate.getHours() + extraHours);
        newEndAt.setMinutes(startDate.getMinutes() + extraMinutes);

        updateEvent(id, { end_at: newEndAt.toISOString() });
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        showModal();
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    rootEl.addEventListener('mousedown', handleMouseDown);
    return () => rootEl.removeEventListener('mousedown', handleMouseDown);
  }, [
    id,
    startDate,
    updateEvent,
    isDragging,
    isResizing,
    hideModal,
    showModal,
  ]);

  // Event dragging
  useEffect(() => {
    const rootEl = contentRef.current;
    const cardEl = rootEl?.parentElement;
    const cellEl = document.querySelector('.calendar-cell') as HTMLDivElement;

    if (!rootEl || !cardEl || !cellEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      if (isResizing) return;
      setIsDragging(true);
      hideModal();

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = cardEl.offsetLeft;
      const startTop = cardEl.offsetTop;
      const columnWidth = cellEl.offsetWidth;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        if (isResizing) return;

        // Calculate new position
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Snap to grid
        const top = Math.round((startTop + deltaY) / 20) * 20;
        const left =
          Math.round((startLeft + deltaX) / columnWidth) * columnWidth;

        // Update position if changed
        if (top !== cardEl.offsetTop || left !== cardEl.offsetLeft) {
          cardEl.style.top = `${top}px`;
          cardEl.style.left = `${left}px`;

          // Calculate new date index
          const newDateIdx = Math.floor(left / columnWidth);

          // Calculate new times
          const newStartAt = new Date(startDate);
          const newStartHour = Math.floor(top / 80);
          const newStartMinute = Math.round(((top % 80) / 80) * 60);

          newStartAt.setHours(newStartHour);
          newStartAt.setMinutes(newStartMinute);

          // Update date if moved to different day
          if (newDateIdx >= 0 && newDateIdx < dates.length) {
            const newDate = dates[newDateIdx];
            if (!newDate) return;
            newStartAt.setFullYear(newDate.getFullYear());
            newStartAt.setMonth(newDate.getMonth());
            newStartAt.setDate(newDate.getDate());
          }

          // Calculate new end time maintaining duration
          const newEndAt = new Date(newStartAt);
          newEndAt.setTime(
            newStartAt.getTime() + (endDate.getTime() - startDate.getTime())
          );

          updateEvent(id, {
            start_at: newStartAt.toISOString(),
            end_at: newEndAt.toISOString(),
          });
        }
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        showModal();
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    rootEl.addEventListener('mousedown', handleMouseDown);
    return () => rootEl.removeEventListener('mousedown', handleMouseDown);
  }, [
    id,
    updateEvent,
    isResizing,
    startDate,
    endDate,
    duration,
    isDragging,
    dates,
    hideModal,
    showModal,
  ]);

  // Color styles based on event color
  const getEventStyles = () => {
    const colorStyles: Record<
      string,
      { bg: string; border: string; text: string }
    > = {
      blue: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        border: 'border-blue-500/80 dark:border-blue-300/80',
        text: 'text-blue-700 dark:text-blue-300',
      },
      red: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        border: 'border-red-500/80 dark:border-red-300/80',
        text: 'text-red-700 dark:text-red-300',
      },
      green: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        border: 'border-green-500/80 dark:border-green-300/80',
        text: 'text-green-700 dark:text-green-300',
      },
      yellow: {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        border: 'border-yellow-500/80 dark:border-yellow-300/80',
        text: 'text-yellow-700 dark:text-yellow-300',
      },
      purple: {
        bg: 'bg-purple-100 dark:bg-purple-900/30',
        border: 'border-purple-500/80 dark:border-purple-300/80',
        text: 'text-purple-700 dark:text-purple-300',
      },
      pink: {
        bg: 'bg-pink-100 dark:bg-pink-900/30',
        border: 'border-pink-500/80 dark:border-pink-300/80',
        text: 'text-pink-700 dark:text-pink-300',
      },
      orange: {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        border: 'border-orange-500/80 dark:border-orange-300/80',
        text: 'text-orange-700 dark:text-orange-300',
      },
      gray: {
        bg: 'bg-gray-100 dark:bg-gray-900/30',
        border: 'border-gray-500/80 dark:border-gray-300/80',
        text: 'text-gray-700 dark:text-gray-300',
      },
    };

    return colorStyles[color.toLowerCase()] || colorStyles.blue;
  };

  const { bg, border, text } = getEventStyles()!;

  return (
    <div
      id={`event-${id}`}
      className={cn(
        'pointer-events-auto absolute max-w-none overflow-hidden rounded border select-none',
        'hover:ring-2 hover:ring-primary/50',
        'active:ring-2 active:ring-primary',
        bg,
        border,
        text
      )}
      style={{
        transition:
          'width 150ms ease-in-out, left 150ms ease-in-out, opacity 300ms ease-in-out',
        zIndex: isDragging || isResizing ? 50 : 1,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        showModal();
      }}
    >
      <div
        ref={contentRef}
        className={cn(
          'h-full cursor-move p-1 text-left text-sm select-none',
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
          'absolute inset-x-0 bottom-0 cursor-s-resize hover:bg-primary/10',
          duration <= 0.25 ? 'h-1.5' : 'h-2'
        )}
      />
    </div>
  );
}
