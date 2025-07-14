export default function TimeColumn({
  id,
  start,
  end,
  className,
}: {
  id: string;
  start: number;
  end: number;
  className?: string;
}) {
  const hours = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className={className}>
      <div className="h-12 w-12" /> {/* Spacer for date header */}
      <div className="flex flex-col">
        {hours.map((hour) => (
          <div key={hour} className="flex flex-col">
            <div className="h-4 w-12 pr-2 text-right text-xs opacity-60">
              {hour}:00
            </div>
            <div className="h-4 w-12" />
            <div className="h-4 w-12" />
            <div className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
