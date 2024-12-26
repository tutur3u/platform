import { useCalendar } from '@/hooks/useCalendar';
import { CalendarEvent } from '@/types/primitives/calendar-event';
import { Popover } from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import moment from 'moment';
import { useEffect, useRef, useState } from 'react';

interface EventCardProps {
  dates: Date[];
  wsId: string;
  event: CalendarEvent;
}

export default function EventCard({ dates, wsId, event }: EventCardProps) {
  const { id, title, start_at, end_at, color } = event;

  const {
    getEventLevel: getLevel,
    updateEvent,
    getActiveEvent,
    openModal,
    closeModal,
    hideModal,
    showModal,
  } = useCalendar();

  useEffect(() => {
    const syncEvent = async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${wsId}/calendar/events/${id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
          }
        );

        if (!res.ok) throw new Error('Failed to sync event');
      } catch (err) {
        console.error(err);
      }
    };

    if (event.local) {
      // Wait 500ms before syncing the event
      const timeout = setTimeout(() => {
        syncEvent();
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [event, wsId, id]);

  const convertTime = (time: number) => {
    // 9.5 => 9:30
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);

    // pad with 0
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${pad(hours)}:${pad(minutes)}`;
  };

  const startDate = moment(start_at).toDate();
  const endDate = moment(end_at).toDate();

  const startHours = startDate.getHours() + startDate.getMinutes() / 60;
  const endHours = endDate.getHours() + endDate.getMinutes() / 60;

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

    const startHours = startDate.getHours() + startDate.getMinutes() / 60;
    const endHours = endDate.getHours() + endDate.getMinutes() / 60;

    const duration =
      startHours > endHours ? 24 - startHours : endHours - startHours;

    // Calculate event height
    const height = Math.max(20 - 4, duration * 80 - 4);

    // Calculate the index of the day the event is in
    const dateIdx = dates.findIndex((date) => {
      return (
        date.getFullYear() === startDate.getFullYear() &&
        date.getMonth() === startDate.getMonth() &&
        date.getDate() === startDate.getDate()
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

    const observer = new ResizeObserver(() => {
      const left = dateIdx * (cellEl.offsetWidth + 0.5) + level * 12;
      cardEl.style.left = `${left}px`;
    });

    observer.observe(cellEl);

    // Update event time visibility
    const timeEl = cardEl.querySelector('#time');
    if (duration <= 0.5) timeEl?.classList.add('hidden');
    else timeEl?.classList.remove('hidden');

    return () => observer.disconnect();
  }, [id, startDate, endDate, level, dates]);

  const isPast = () => {
    const endAt = new Date(startDate);

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

    const observer = new ResizeObserver(() => {
      const paddedWidth = cellEl.offsetWidth - (level + 1) * 12;
      const normalWidth = cellEl.offsetWidth - level * 12 - 4;

      const isEditing = isDragging || isResizing;
      const padding = isEditing ? paddedWidth : normalWidth;

      cardEl.style.width = `${padding}px`;
      if (isEditing) hideModal();
    });

    observer.observe(cellEl);

    return () => {
      observer.disconnect();
    };
  }, [id, level, isDragging, isResizing, hideModal]);

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
        const newEndAt = new Date(startDate);

        const extraHours = Math.floor(newDuration);
        const extraMinutes = Math.round((newDuration - extraHours) * 60);

        newEndAt.setHours(newEndAt.getHours() + extraHours);
        newEndAt.setMinutes(newEndAt.getMinutes() + extraMinutes);

        // update event
        updateEvent(id, { end_at: newEndAt.toISOString() });
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
  }, [
    id,
    updateEvent,
    isResizing,
    startDate,
    isDragging,
    hideModal,
    showModal,
  ]);

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

        const dateIdx = dates.findIndex((date) => {
          return (
            date.getFullYear() === startDate.getFullYear() &&
            date.getMonth() === startDate.getMonth() &&
            date.getDate() === startDate.getDate()
          );
        });

        if (dateIdx === -1) return;
        const newDateIdx = Math.round(left / halfCellWidth / 2);

        // calculate new start time
        const newStartAt = new Date(startDate);

        const newStartHour = Math.round(top / 20) / 4;
        const leftoverHour = newStartHour - Math.floor(newStartHour);

        const newStartMinute = Math.round(leftoverHour * 60);

        newStartAt.setHours(Math.floor(newStartHour));
        newStartAt.setMinutes(newStartMinute);

        // calculate new end time (duration)
        const newEndAt = new Date(endDate);

        const extraHours = Math.floor(duration);
        const extraMinutes = Math.round((duration - extraHours) * 60);

        newEndAt.setHours(newStartAt.getHours() + extraHours);
        newEndAt.setMinutes(newStartAt.getMinutes() + extraMinutes);

        // Update startDate and endDate if the date changes
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
        updateEvent(id, {
          start_at: newStartAt.toISOString(),
          end_at: newEndAt.toISOString(),
        });
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
    startDate,
    endDate,
    duration,
    level,
    dates,
    startHours,
    isResizing,
    updateEvent,
    showModal,
    setIsDragging,
  ]);

  const isNotFocused = activeEvent != null && !isOpened;

  const generateColor = () => {
    const eventColor = color?.toLowerCase() || 'blue';

    const colors: {
      [key: string]: string;
    } = {
      red: isNotFocused
        ? 'bg-[#fdecec] dark:bg-[#241f22] border-red-500/40 text-red-600/50 dark:border-red-300/30 dark:text-red-200/50'
        : 'bg-[#fcdada] dark:bg-[#302729] border-red-500/80 text-red-600 dark:border-red-300/80 dark:text-red-200',
      blue: isNotFocused
        ? 'bg-[#ebf2fe] dark:bg-[#1e2127] border-blue-500/40 text-blue-600/50 dark:border-blue-300/30 dark:text-blue-200/50'
        : 'bg-[#d8e6fd] dark:bg-[#252a32] border-blue-500/80 text-blue-600 dark:border-blue-300/80 dark:text-blue-200',
      green: isNotFocused
        ? 'bg-[#e8f9ef] dark:bg-[#1e2323] border-green-500/40 text-green-600/50 dark:border-green-300/30 dark:text-green-200/50'
        : 'bg-[#d3f3df] dark:bg-[#242e2a] border-green-500/80 text-green-600 dark:border-green-300/80 dark:text-green-200',
      yellow: isNotFocused
        ? 'bg-[#fdf7e6] dark:bg-[#24221e] border-yellow-500/40 text-yellow-600/50 dark:border-yellow-300/30 dark:text-yellow-200/50'
        : 'bg-[#fbf0ce] dark:bg-[#302d1f] border-yellow-500/80 text-yellow-600 dark:border-yellow-300/80 dark:text-yellow-200',
      orange: isNotFocused
        ? 'bg-[#fef1e7] dark:bg-[#242020] border-orange-500/40 text-orange-600/50 dark:border-orange-300/30 dark:text-orange-200/50'
        : 'bg-[#fee3d0] dark:bg-[#302924] border-orange-500/80 text-orange-600 dark:border-orange-300/80 dark:text-orange-200',
      purple: isNotFocused
        ? 'bg-[#f6eefe] dark:bg-[#222027] border-purple-500/40 text-purple-600/50 dark:border-purple-300/30 dark:text-purple-200/50'
        : 'bg-[#eeddfd] dark:bg-[#2c2832] border-purple-500/80 text-purple-600 dark:border-purple-300/80 dark:text-purple-200',
      pink: isNotFocused
        ? 'bg-[#fdecf5] dark:bg-[#242025] border-pink-500/40 text-pink-600/50 dark:border-pink-300/30 dark:text-pink-200/50'
        : 'bg-[#fbdaeb] dark:bg-[#2f272e] border-pink-500/80 text-pink-600 dark:border-pink-300/80 dark:text-pink-200',
      indigo: isNotFocused
        ? 'bg-[#efeffe] dark:bg-[#1f2027] border-indigo-500/40 text-indigo-600/50 dark:border-indigo-300/30 dark:text-indigo-200/50'
        : 'bg-[#e0e0fc] dark:bg-[#272832] border-indigo-500/80 text-indigo-600 dark:border-indigo-300/80 dark:text-indigo-200',
      cyan: isNotFocused
        ? 'bg-[#e6f8fb] dark:bg-[#1c2327] border-cyan-500/40 text-cyan-600/50 dark:border-cyan-300/30 dark:text-cyan-200/50'
        : 'bg-[#cdf0f6] dark:bg-[#212e31] border-cyan-500/80 text-cyan-600 dark:border-cyan-300/80 dark:text-cyan-200',
      gray: isNotFocused
        ? 'bg-[#f0f1f2] dark:bg-[#222225] border-gray-500/40 text-gray-600/50 dark:border-gray-300/30 dark:text-gray-200/50'
        : 'bg-[#e1e3e6] dark:bg-[#2b2c2e] border-gray-500/80 text-gray-600 dark:border-gray-300/80 dark:text-gray-200',
    };

    return colors[eventColor];
  };

  return (
    <Popover
      opened={isOpened}
      position="right"
      onClose={closeModal}
      disabled={window.innerWidth < 768}
      classNames={{
        arrow: `${generateColor()} border-2`,
      }}
      trapFocus
    >
      <Popover.Dropdown className={`${generateColor()} border-2`}>
        {/* <CalendarEventEditForm id={id} /> */}
      </Popover.Dropdown>

      <div
        id={`event-${id}`}
        className={`pointer-events-auto absolute max-w-2xl overflow-hidden rounded border-l-4 ${
          isPast() && !isOpened
            ? 'border-zinc-400 border-opacity-30 bg-[#e3e3e4] text-zinc-400 dark:border-zinc-600 dark:bg-[#1c1c1e]'
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
              {isPast() ? '✅'.concat(title || '') : title}
            </div>
            {duration > 0.5 && (
              <div
                id="time"
                className={
                  isPast()
                    ? 'text-zinc-400/50'
                    : `${generateColor()} opacity-80`
                }
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
