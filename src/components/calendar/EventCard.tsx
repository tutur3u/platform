import { Popover } from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';
import { useCalendar } from '../../hooks/useCalendar';
import { CalendarEventBase } from '../../types/primitives/CalendarEventBase';
import CalendarEventEditForm from '../forms/CalendarEventEditForm';

interface EventCardProps {
  event: CalendarEventBase;
}

export default function EventCard({ event }: EventCardProps) {
  const { id, title, start_at, end_at } = event;

  const {
    getEventLevel: getLevel,
    updateEvent,
    getDatesInView,
    getActiveEvent,
    openModal,
    closeModal,
    hideModal,
    showModal,
  } = useCalendar();

  const convertTime = (time: number) => {
    // 9.5 => 9:30
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);

    // pad with 0
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${pad(hours)}:${pad(minutes)}`;
  };

  const startHours = start_at.getHours() + start_at.getMinutes() / 60;
  const endHours = end_at.getHours() + end_at.getMinutes() / 60;

  const startTime = convertTime(startHours);
  const endTime = convertTime(endHours);

  const duration =
    startHours > endHours ? 24 - startHours : endHours - startHours;

  const level = getLevel ? getLevel(id) : 0;

  const cardStyle = {
    minHeight: 16,
    opacity: 0,
    transition:
      'width 150ms ease-in-out,' +
      'left 150ms ease-in-out,' +
      'opacity 0.3s ease-in-out,' +
      'background-color 0.5s ease-in-out,' +
      'border-color 0.5s ease-in-out,' +
      'color 0.5s ease-in-out',
  };

  useEffect(() => {
    // Every time the event is updated, update the card style
    const cardEl = document.getElementById(`event-${id}`);

    const cellEl = document.querySelector(
      `.calendar-cell`
    ) as HTMLDivElement | null;

    if (!cardEl || !cellEl) return;

    const startHours = start_at.getHours() + start_at.getMinutes() / 60;
    const endHours = end_at.getHours() + end_at.getMinutes() / 60;

    const duration =
      startHours > endHours ? 24 - startHours : endHours - startHours;

    // Calculate event height
    const height = Math.max(20 - 4, duration * 80 - 4);

    // Get dates
    const dates = getDatesInView();

    // Calculate the index of the day the event is in
    const dateIdx = dates.findIndex((date) => {
      return (
        date.getFullYear() === start_at.getFullYear() &&
        date.getMonth() === start_at.getMonth() &&
        date.getDate() === start_at.getDate()
      );
    });

    if (dateIdx === -1) {
      cardEl.style.transitionDelay = '0ms, 0ms, 0ms, 0ms, 0ms, 0ms';
      cardEl.style.opacity = '0';
      cardEl.style.pointerEvents = 'none';
      return;
    } else {
      cardEl.style.transitionDelay = '0ms, 0ms, 300ms, 0ms, 0ms, 0ms';
      cardEl.style.opacity = '1';
      cardEl.style.pointerEvents = 'all';
    }

    // Update event dimensions
    cardEl.style.height = `${height}px`;

    // Update event position
    cardEl.style.top = `${startHours * 80}px`;
    const left = dateIdx * (cellEl.offsetWidth + 0.5) + level * 12;
    cardEl.style.left = `${left}px`;

    // Update event time visibility
    const timeEl = cardEl.querySelector('#time');
    if (duration <= 0.5) timeEl?.classList.add('hidden');
    else timeEl?.classList.remove('hidden');
  }, [id, start_at, end_at, level, getDatesInView]);

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

  const [isDragging, setIsDragging] = useDebouncedState(false, 200);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    // If the event is being dragged or resized, update the card width
    const cardEl = document.getElementById(`event-${id}`);
    if (!cardEl) return;

    const cellEl = document.querySelector(
      `.calendar-cell`
    ) as HTMLDivElement | null;
    if (!cellEl) return;

    const paddedWidth = cellEl.offsetWidth - (level + 1) * 12;
    const normalWidth = cellEl.offsetWidth - level * 12 - 4;

    const isEditing = isDragging || isResizing;
    const padding = isEditing ? paddedWidth : normalWidth;

    cardEl.style.width = `${padding}px`;

    if (isEditing) hideModal();
  }, [id, level, isDragging, isResizing, getDatesInView, hideModal]);

  const activeEvent = getActiveEvent();
  const isOpened = activeEvent?.id === id;

  // Event resizing
  useEffect(() => {
    const rootEl = handleRef.current;
    if (!rootEl) return;

    const cardEl = rootEl.parentElement;
    if (!cardEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();

      if (isDragging || isResizing) return;
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

        // update event
        updateEvent(id, { end_at: newEndAt });
      };

      const handleMouseUp = (e: MouseEvent) => {
        e.preventDefault();

        if (isDragging) return;
        setIsResizing(false);
        showModal();

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

    if (isDragging) return;
    rootEl.addEventListener('mousedown', handleMouseDown);

    return () => {
      rootEl.removeEventListener('mousedown', handleMouseDown);
    };
  }, [id, updateEvent, isResizing, start_at, isDragging, hideModal, showModal]);

  // Event dragging
  useEffect(() => {
    const rootEl = contentRef.current;
    if (!rootEl) return;

    const cardEl = rootEl.parentElement;
    if (!cardEl) return;

    const cellEl = document.querySelector(
      `.calendar-cell`
    ) as HTMLDivElement | null;
    if (!cellEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();

      if (isResizing) return;
      setIsDragging(true);

      const startX = e.clientX;
      const startY = e.clientY;

      const startLeft = cardEl.offsetLeft;
      const startTop = cardEl.offsetTop;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();

        if (isResizing) return;

        const top = Math.round((startTop + e.clientY - startY) / 20) * 20;

        const cellWidth = cellEl.offsetWidth;
        const halfCellWidth = cellWidth / 2;

        const left =
          Math.round((startLeft + e.clientX - startX) / halfCellWidth) *
          halfCellWidth;

        // If the top or left doesn't change, don't update
        if (top === cardEl.offsetTop && left === cardEl.offsetLeft) return;

        const dates = getDatesInView();

        const dateIdx = dates.findIndex((date) => {
          return (
            date.getFullYear() === start_at.getFullYear() &&
            date.getMonth() === start_at.getMonth() &&
            date.getDate() === start_at.getDate()
          );
        });

        if (dateIdx === -1) return;
        const newDateIdx = Math.round(left / halfCellWidth / 2);

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

        // Update start_at and end_at if the date changes
        if (dateIdx !== newDateIdx) {
          const newDate = dates[newDateIdx];
          if (!newDate) return;

          newStartAt.setFullYear(newDate.getFullYear());
          newStartAt.setMonth(newDate.getMonth());
          newStartAt.setDate(newDate.getDate());

          newEndAt.setFullYear(newDate.getFullYear());
          newEndAt.setMonth(newDate.getMonth());
          newEndAt.setDate(newDate.getDate());
        }

        // update event
        updateEvent(id, { start_at: newStartAt, end_at: newEndAt });
      };

      const handleMouseUp = (e: MouseEvent) => {
        e.preventDefault();

        if (isResizing) return;
        setIsDragging(false);
        showModal();

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

    if (isResizing) return;
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
    updateEvent,
    getDatesInView,
    showModal,
    setIsDragging,
  ]);

  const isNotFocused = activeEvent != null && !isOpened;

  const generateColor = () => {
    const eventColor = event?.color || 'blue';

    const colors: {
      [key: string]: string;
    } = {
      red: `border-red-300/80 text-red-200 ${
        isNotFocused ? 'bg-[#241f22]' : 'bg-[#302729]'
      }`,
      blue: `border-blue-300/80 text-blue-200 ${
        isNotFocused ? 'bg-[#1e2127]' : 'bg-[#252a32]'
      }`,
      green: `border-green-300/80 text-green-200 ${
        isNotFocused ? 'bg-[#1e2323]' : 'bg-[#242e2a]'
      }`,
      yellow: `border-yellow-300/80 text-yellow-200 ${
        isNotFocused ? 'bg-[#24221e]' : 'bg-[#302d1f]'
      }`,
      orange: `border-orange-300/80 text-orange-200 ${
        isNotFocused ? 'bg-[#242020]' : 'bg-[#302924]'
      }`,
      purple: `border-purple-300/80 text-purple-200 ${
        isNotFocused ? 'bg-[#222027]' : 'bg-[#2c2832]'
      }`,
      pink: `border-pink-300/80 text-pink-200 ${
        isNotFocused ? 'bg-[#242025]' : 'bg-[#2f272e]'
      }`,
      indigo: `border-indigo-300/80 text-indigo-200 ${
        isNotFocused ? 'bg-[#1f2027]' : 'bg-[#272832]'
      }`,
      cyan: `border-cyan-300/80 text-cyan-200 ${
        isNotFocused ? 'bg-[#1c2327]' : 'bg-[#212e31]'
      }`,
      gray: `border-gray-300/80 text-gray-200 ${
        isNotFocused ? 'bg-[#222225]' : 'bg-[#2b2c2e]'
      }`,
    };

    return colors[eventColor];
  };

  return (
    <Popover
      opened={isOpened}
      position="right"
      onClose={closeModal}
      classNames={{
        arrow: `${generateColor()} border-2`,
      }}
      trapFocus
    >
      <Popover.Dropdown className={`${generateColor()} border-2`}>
        <CalendarEventEditForm id={event.id} />
      </Popover.Dropdown>
      <div
        id={`event-${id}`}
        className={`pointer-events-auto absolute max-w-2xl overflow-hidden rounded border-l-4 ${
          isPast() && !isOpened
            ? 'border-zinc-500 border-opacity-30 bg-[#1c1c1e] text-zinc-400'
            : generateColor()
        } ${isNotFocused && 'border-transparent text-opacity-10'} ${
          level && 'border'
        }`}
        style={cardStyle}
        onContextMenu={(e) => {
          e.preventDefault();
          openModal(id);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          openModal(id);
        }}
      >
        <Popover.Target>
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
              {isPast() ? '✅'.concat(title) : title}
            </div>
            {duration > 0.5 && (
              <div
                id="time"
                className={isPast() ? 'text-zinc-400/50' : 'text-zinc-200/50'}
              >
                {startTime} - {endTime}
              </div>
            )}
          </div>
        </Popover.Target>

        <div
          id="handle"
          ref={handleRef}
          className={`absolute inset-x-0 bottom-0 cursor-s-resize ${
            duration <= 0.25 ? 'h-1' : 'h-2'
          }`}
        />
      </div>
    </Popover>
  );
}
