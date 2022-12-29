import { useEffect, useRef, useState } from 'react';
import { CalendarEvent } from '../../types/primitives/CalendarEvent';

interface EventCardProps {
  event: CalendarEvent;
  getLevel: (event: CalendarEvent) => number;
  onUpdated: (event: CalendarEvent) => void;
}

export default function EventCard({
  event,
  getLevel,
  onUpdated,
}: EventCardProps) {
  const convertTime = (time: number) => {
    // 9.5 => 9:30
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);
    return `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
  };

  const startHour =
    event.start_at.getHours() + event.start_at.getMinutes() / 60;
  const endHour = event.end_at.getHours() + event.end_at.getMinutes() / 60;

  const startTime = convertTime(startHour);
  const endTime = convertTime(endHour);

  const duration = endHour - startHour;

  const level = getLevel ? getLevel(event) : 0;

  const cardStyle = {
    top: startHour * 80,
    left: level * 12,
    height: duration * 80 - 4,
    minHeight: 16,
    width: `calc(100% - ${level * 12 + 4}px)`,
    transition:
      'width 150ms ease-in-out, left 150ms ease-in-out, background-color 0.5s ease-in-out, border-color 0.5s ease-in-out, color 0.5s ease-in-out',
  };

  const isPast = () => {
    const endAt = new Date(event.start_at);

    const extraHours = Math.floor(duration);
    const extraMinutes = Math.round((duration - extraHours) * 60);

    endAt.setHours(endAt.getHours() + extraHours);
    endAt.setMinutes(endAt.getMinutes() + extraMinutes);

    return endAt < new Date();
  };

  const handleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [isResizing, setIsResizing] = useState(false);

  // Event resizing
  useEffect(() => {
    const rootEl = handleRef.current;
    if (!rootEl) return;

    const cardEl = rootEl.parentElement;
    if (!cardEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();

      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = cardEl.offsetHeight;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();

        const height = Math.max(
          20 - 4,
          Math.round((startHeight + e.clientY - startY) / 20) * 20 - 4
        );

        const width = `calc(100% - ${(level + 1) * 12}px)`;
        const left = `${level * 12}px`;

        cardEl.style.height = height + 'px';
        cardEl.style.width = width;
        cardEl.style.left = left;

        // calculate new end time
        const newDuration = Math.round(cardEl.offsetHeight / 20) / 4;
        const newEndAt = new Date(event.start_at);

        const extraHours = Math.floor(newDuration);
        const extraMinutes = Math.round((newDuration - extraHours) * 60);

        newEndAt.setHours(newEndAt.getHours() + extraHours);
        newEndAt.setMinutes(newEndAt.getMinutes() + extraMinutes);

        if (newDuration <= 0.5)
          cardEl.querySelector('#time')?.classList.add('hidden');
        else cardEl.querySelector('#time')?.classList.remove('hidden');

        // update event
        onUpdated({ ...event, end_at: newEndAt });
      };

      const handleMouseUp = (e: MouseEvent) => {
        e.preventDefault();

        setIsResizing(false);

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        // revert to original width
        const newLevel = Math.round(cardEl.offsetLeft / 12);
        cardEl.style.width = `calc(100% - ${newLevel * 12 + 4}px)`;
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
  }, [event, level, onUpdated]);

  // Event dragging
  useEffect(() => {
    const rootEl = contentRef.current;
    if (!rootEl) return;

    const cardEl = rootEl.parentElement;
    if (!cardEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();

      if (isResizing) return;

      const startY = e.clientY;
      const startTop = cardEl.offsetTop;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();

        if (isResizing) return;

        const top = Math.max(
          0,
          Math.round((startTop + e.clientY - startY) / 20) * 20
        );

        const newLevel = Math.round(cardEl.offsetLeft / 12);
        const width = `calc(100% - ${(newLevel + 1) * 12}px)`;

        cardEl.style.top = top + 'px';
        cardEl.style.width = width;

        // calculate new start time
        const newStartAt = new Date(event.start_at);

        const newStartHour = Math.round(top / 20) / 4;
        const leftoverHour = newStartHour - Math.floor(newStartHour);

        const newStartMinute = Math.round(leftoverHour * 60);

        newStartAt.setHours(Math.floor(newStartHour));
        newStartAt.setMinutes(newStartMinute);

        // calculate new end time (duration)
        const newEndAt = new Date(event.end_at);

        const extraHours = Math.floor(duration);
        const extraMinutes = Math.round((duration - extraHours) * 60);

        newEndAt.setHours(newStartAt.getHours() + extraHours);
        newEndAt.setMinutes(newStartAt.getMinutes() + extraMinutes);

        // update event
        onUpdated({ ...event, start_at: newStartAt, end_at: newEndAt });
      };

      const handleMouseUp = (e: MouseEvent) => {
        e.preventDefault();

        if (isResizing) return;

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        // revert to original width
        const newLevel = Math.round(cardEl.offsetLeft / 12);
        cardEl.style.width = `calc(100% - ${newLevel * 12 + 4}px)`;
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
  }, [event, level, onUpdated, startHour, isResizing, duration]);

  return (
    <div
      id="card"
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
          {event.title}
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
