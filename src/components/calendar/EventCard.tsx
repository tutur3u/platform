import { useEffect, useRef, useState } from 'react';

interface EventCardProps {
  data: {
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  };
}

export default function EventCard({ data }: EventCardProps) {
  const [task, setTask] = useState<{
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  }>(data);

  const convertTime = (time: number) => {
    // 9.5 => 9:30
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);
    return `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
  };

  const startHour = task.startAt.getHours() + task.startAt.getMinutes() / 60;

  const startTime = convertTime(startHour);
  const endTime = convertTime(startHour + task.duration);

  const isPast = () => {
    const endAt = new Date(task.startAt);

    const extraHours = Math.floor(task.duration);
    const extraMinutes = Math.round((task.duration - extraHours) * 60);

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

        const width = 'calc(100% - 16px)';

        rootEl.style.height = height + 'px';
        rootEl.style.width = width;

        // calculate new duration
        const newDuration = Math.round(rootEl.offsetHeight / 20) / 4;

        // update duration
        if (newDuration !== task.duration) {
          setTask((prev) => ({ ...prev, duration: newDuration }));
        }

        if (newDuration <= 0.5)
          rootEl.querySelector('#time')?.classList.add('hidden');
        else rootEl.querySelector('#time')?.classList.remove('hidden');
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        // add "hover" class
        rootEl.classList.add('hover:bg-[#44566d]');

        // revert to original width
        rootEl.style.width = 'calc(100% - 4px)';
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    handleEl.addEventListener('mousedown', handleMouseDown);

    return () => {
      handleEl.removeEventListener('mousedown', handleMouseDown);
    };
  }, [task]);

  return (
    <div
      ref={ref}
      className={`absolute flex w-full flex-col items-start overflow-hidden rounded border-l-4 border-blue-300 p-1 text-left text-sm text-blue-300 duration-500 ${
        isPast()
          ? 'border-opacity-30 bg-[#232830] text-opacity-50'
          : 'bg-[#3d4c5f] hover:bg-[#44566d]'
      }`}
      style={{
        top: startHour * 80,
        height: task.duration * 80 - 4,
        minHeight: 25,
        width: 'calc(100% - 4px)',
        transition:
          'width 150ms ease-in-out, background-color 0.5s ease-in-out, border-color 0.5s ease-in-out, color 0.5s ease-in-out',
      }}
    >
      <div className="font-semibold line-clamp-1">{task.title}</div>
      {task.duration > 0.5 && (
        <div id="time" className="text-blue-200">
          {startTime} - {endTime}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-2 cursor-s-resize"></div>
    </div>
  );
}
