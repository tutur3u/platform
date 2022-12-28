import { useEffect, useRef } from 'react';

interface EventCardProps {
  data: {
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  };
  getLevel: (task: {
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  }) => number;
  onUpdated: (task: {
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  }) => void;
}

export default function EventCard({
  data,
  getLevel,
  onUpdated,
}: EventCardProps) {
  const convertTime = (time: number) => {
    // 9.5 => 9:30
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);
    return `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
  };

  const startHour = data.startAt.getHours() + data.startAt.getMinutes() / 60;

  const startTime = convertTime(startHour);
  const endTime = convertTime(startHour + data.duration);

  const level = getLevel ? getLevel(data) : 0;

  const cardStyle = {
    top: startHour * 80,
    left: level * 16,
    height: data.duration * 80 - 4,
    minHeight: 25,
    width: `calc(100% - ${level * 16 + 4}px)`,
    transition:
      'width 150ms ease-in-out, left 150ms ease-in-out, background-color 0.5s ease-in-out, border-color 0.5s ease-in-out, color 0.5s ease-in-out',
  };

  const isPast = () => {
    const endAt = new Date(data.startAt);

    const extraHours = Math.floor(data.duration);
    const extraMinutes = Math.round((data.duration - extraHours) * 60);

    endAt.setHours(endAt.getHours() + extraHours);
    endAt.setMinutes(endAt.getMinutes() + extraMinutes);

    return endAt < new Date();
  };

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rootEl = ref.current;
    if (!rootEl) return;

    const handleEl = rootEl?.querySelector(
      '.cursor-s-resize'
    ) as HTMLDivElement;

    if (!handleEl) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();

      const startY = e.clientY;
      const startHeight = rootEl.offsetHeight;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();

        // remove "hover" class
        rootEl.classList.remove('hover:bg-[#44566d]');

        const height = Math.max(
          25,
          Math.round((startHeight + e.clientY - startY) / 20) * 20 - 4
        );

        const width = `calc(100% - ${level * 16 + 4}px)`;
        const left = `${level * 16}px`;

        rootEl.style.height = height + 'px';
        rootEl.style.width = width;
        rootEl.style.left = left;

        // calculate new duration
        const newDuration = Math.round(rootEl.offsetHeight / 20) / 4;

        if (newDuration <= 0.5)
          rootEl.querySelector('#time')?.classList.add('hidden');
        else rootEl.querySelector('#time')?.classList.remove('hidden');

        // update duration
        if (newDuration !== data.duration)
          onUpdated({ ...data, duration: newDuration });
      };

      const handleMouseUp = (e: MouseEvent) => {
        e.preventDefault();

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        // add "hover" class
        rootEl.classList.add('hover:bg-[#44566d]');

        // revert to original width
        rootEl.style.width = `calc(100% - ${level * 16 + 4}px)`;
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    };

    handleEl.addEventListener('mousedown', handleMouseDown);

    return () => {
      handleEl.removeEventListener('mousedown', handleMouseDown);
    };
  }, [data, level, onUpdated]);

  return (
    <div
      ref={ref}
      className={`absolute flex w-full flex-col items-start overflow-hidden rounded border-l-4 border-blue-300 p-1 text-left text-sm text-blue-300 duration-500 ${
        isPast()
          ? 'border-opacity-30 bg-[#232830] text-opacity-50'
          : 'bg-[#3d4c5f] hover:bg-[#44566d]'
      }`}
      style={cardStyle}
    >
      <div
        className={`font-semibold ${
          data.duration <= 0.75 ? 'line-clamp-1' : 'line-clamp-2'
        }`}
      >
        {data.title}
      </div>
      {data.duration > 0.5 && (
        <div id="time" className="text-blue-200">
          {startTime} - {endTime}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-2 cursor-s-resize"></div>
    </div>
  );
}
