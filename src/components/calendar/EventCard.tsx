interface EventCardProps {
  task: {
    id: number;
    title: string;
    duration: number;
    startAt: number;
  };
}

export default function EventCard({ task }: EventCardProps) {
  const convertTime = (time: number) => {
    // 9.5 => 9:30
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);
    return `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
  };

  const startTime = convertTime(task.startAt);
  const endTime = convertTime(task.startAt + task.duration);

  return (
    <div
      className="absolute flex w-full flex-col items-start overflow-hidden rounded border-l-4 border-blue-300 bg-[#3d4c5f] p-1 text-left text-sm text-blue-300 transition hover:bg-[#44566d]"
      style={{
        top: task.startAt * 80,
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
