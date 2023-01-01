import { useEffect, useRef, useState } from 'react';
import { CalendarEvent } from '../../types/primitives/CalendarEvent';

interface EventCardProps {
  event: CalendarEvent;
  getLevel: (eventId: string) => number;
  onUpdated: (id: string, data: Partial<CalendarEvent>) => void;
}

export default function EventCard({
  event,
  getLevel,
  onUpdated,
}: EventCardProps) {
  const { id, title, start_at, end_at } = event;

  const convertTime = (time: number) => {
    // 9.5 => 9:30
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);
    return `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
  };

  const startHours = start_at.getHours() + start_at.getMinutes() / 60;
  const endHours = end_at.getHours() + end_at.getMinutes() / 60;

  const startTime = convertTime(startHours);
  const endTime = convertTime(endHours);

  const duration = endHours - startHours;

  const level = getLevel ? getLevel(id) : 0;

  const cardStyle = {
    minHeight: 16,
    transition:
      'width 150ms ease-in-out,' +
      'left 150ms ease-in-out,' +
      'background-color 0.5s ease-in-out,' +
      'border-color 0.5s ease-in-out,' +
      'color 0.5s ease-in-out',
  };

  useEffect(() => {
    // Every time the event is updated, update the card style
    const cardEl = document.getElementById(`event-${id}`);
    if (!cardEl) return;

    // Calculate event height
    const height = Math.max(20 - 4, duration * 80 - 4);

    // Update event dimensions
    cardEl.style.height = `${height}px`;

    // Update event position
    cardEl.style.top = `${startHours * 80}px`;
    cardEl.style.left = `${level * 12}px`;

    // Update event time visibility
    const timeEl = cardEl.querySelector('#time');
    if (duration <= 0.5) timeEl?.classList.add('hidden');
    else timeEl?.classList.remove('hidden');
  }, [id, duration, level, startHours]);

  const isPast = () => {
    const endAt = new Date(start_at);

    const extraHours = Math.floor(duration);
    const extraMinutes = Math.round((duration - extraHours) * 60);

    endAt.setHours(endAt.getHours() + extraHours);
    endAt.setMinutes(endAt.getMinutes() + extraMinutes);

    return endAt < new Date();
  };

  const handleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    // If the event is being dragged or resized, update the card width
    const cardEl = document.getElementById(`event-${id}`);
    if (!cardEl) return;

    const paddedWidth = (level + 1) * 12;
    const normalWidth = level * 12 + 4;

    const isEditing = isDragging || isResizing;
    const padding = isEditing ? paddedWidth : normalWidth;

    cardEl.style.width = `calc(100% - ${padding}px)`;
  }, [id, level, isDragging, isResizing]);

  // Event resizing
  useEffect(() => {
    const rootEl = handleRef.current;
    if (!rootEl) return;

    const cardEl = rootEl.parentElement;
    if (!cardEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();

      if (isDragging) return;
      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = cardEl.offsetHeight;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();

        if (isDragging) return;
        setIsResizing(true);

        const height =
          Math.round((startHeight + e.clientY - startY) / 20) * 20 - 4;

        // If the height doesn't change, don't update
        if (height === cardEl.offsetHeight) return;
        cardEl.style.height = height + 'px';

        // calculate new end time
        const newDuration = Math.round(cardEl.offsetHeight / 20) / 4;
        const newEndAt = new Date(start_at);

        const extraHours = Math.floor(newDuration);
        const extraMinutes = Math.round((newDuration - extraHours) * 60);

        newEndAt.setHours(newEndAt.getHours() + extraHours);
        newEndAt.setMinutes(newEndAt.getMinutes() + extraMinutes);

        // If the end time is before the start time, don't update
        if (newEndAt < start_at) return;

        // update event
        onUpdated(id, { end_at: newEndAt });
      };

      const handleMouseUp = (e: MouseEvent) => {
        e.preventDefault();

        if (isDragging) return;
        console.log('mouseup resize');
        setIsResizing(false);

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    };

    rootEl.addEventListener('mousedown', handleMouseDown);

    return () => {
      rootEl.removeEventListener('mousedown', handleMouseDown);
    };
  }, [id, onUpdated, start_at, isDragging]);

  // Event dragging
  useEffect(() => {
    const rootEl = contentRef.current;
    if (!rootEl) return;

    const cardEl = rootEl.parentElement;
    if (!cardEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();

      if (isResizing) return;
      setIsDragging(true);

      const startY = e.clientY;
      const startTop = cardEl.offsetTop;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();

        if (isResizing) return;

        const top = Math.round((startTop + e.clientY - startY) / 20) * 20;

        // If the top doesn't change, don't update
        if (top === cardEl.offsetTop) return;
        cardEl.style.top = top + 'px';

        // calculate new start time
        const newStartAt = new Date(start_at);

        const newStartHour = Math.round(top / 20) / 4;
        const leftoverHour = newStartHour - Math.floor(newStartHour);

        const newStartMinute = Math.round(leftoverHour * 60);

        newStartAt.setHours(Math.floor(newStartHour));
        newStartAt.setMinutes(newStartMinute);

        // calculate new end time (duration)
        const newEndAt = new Date(end_at);

        const extraHours = Math.floor(duration);
        const extraMinutes = Math.round((duration - extraHours) * 60);

        newEndAt.setHours(newStartAt.getHours() + extraHours);
        newEndAt.setMinutes(newStartAt.getMinutes() + extraMinutes);

        // If the end time is before the start time, don't update
        if (newEndAt < newStartAt) return;

        // update event
        onUpdated(id, { start_at: newStartAt, end_at: newEndAt });
      };

      const handleMouseUp = (e: MouseEvent) => {
        e.preventDefault();

        if (isResizing) return;
        console.log('mouseup drag');
        setIsDragging(false);

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    };

    cardEl.addEventListener('mousedown', handleMouseDown);

    return () => {
      cardEl.removeEventListener('mousedown', handleMouseDown);
    };
  }, [
    id,
    start_at,
    end_at,
    duration,
    level,
    startHours,
    isResizing,
    onUpdated,
  ]);

  return (
    <div
      id={`event-${id}`}
      className={`absolute w-full overflow-hidden rounded border-l-4 border-blue-300 text-blue-300 duration-500 ${
        isPast()
          ? 'border-opacity-30 bg-[#232830] text-opacity-50'
          : 'bg-[#3d4c5f]'
      } ${level && 'border'}`}
      style={cardStyle}
    >
      <div
        id="content"
        ref={contentRef}
        className={`flex cursor-pointer flex-col items-start text-left ${
          duration <= 0.25
            ? 'h-[calc(100%-0.25rem)] px-1 text-xs'
            : 'h-[calc(100%-0.5rem)] p-1 text-sm'
        }`}
      >
        <div
          className={`flex-none font-semibold ${
            duration <= 0.75 ? 'line-clamp-1' : 'line-clamp-2'
          }`}
        >
          {title}
        </div>
        {duration > 0.5 && (
          <div id="time" className="text-blue-200">
            {startTime} - {endTime}
          </div>
        )}
      </div>
      <div
        id="handle"
        ref={handleRef}
        className={`absolute inset-x-0 bottom-0 cursor-s-resize ${
          duration <= 0.25 ? 'h-1' : 'h-2'
        }`}
      />
    </div>
  );
}
