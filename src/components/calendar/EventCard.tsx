interface EventCardProps {
  task: {
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  };
}

export default function EventCard({ task }: EventCardProps) {
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

  return (
    <div
      className={`absolute flex w-full flex-col items-start overflow-hidden rounded border-l-4 border-blue-300 p-1 text-left text-sm text-blue-300 transition ${
        isPast()
          ? 'border-opacity-30 bg-[#232830] text-opacity-50'
          : 'bg-[#3d4c5f] hover:bg-[#44566d]'
      }`}
      style={{
        top: startHour * 80,
        height: task.duration * 80 - 4,
        minHeight: 25,
        width: 'calc(100% - 4px)',
      }}
    >
      <div className="font-semibold line-clamp-1">{task.title}</div>
      {task.duration > 0.5 && (
        <div className="text-blue-200">
          {startTime} - {endTime}
        </div>
      )}
    </div>
  );
}
