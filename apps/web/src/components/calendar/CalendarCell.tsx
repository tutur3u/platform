import { useCalendar } from '@/hooks/useCalendar';
import { cn } from '@tuturuuu/utils/format';

interface CalendarCellProps {
  date: string;
  hour: number;
}

const CalendarCell = ({ date, hour }: CalendarCellProps) => {
  const { addEmptyEvent } = useCalendar();

  const id = `cell-${date}-${hour}`;

  const handleCreateEvent = (midHour?: boolean) => {
    const newDate = new Date(date);
    newDate.setHours(hour, midHour ? 30 : 0, 0, 0);
    addEmptyEvent(newDate);
  };

  return (
    <div
      id={id}
      className={cn(
        'calendar-cell relative grid h-20 border-r transition-colors hover:bg-muted/10 dark:border-zinc-800',
        hour !== 0 && 'border-t'
      )}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      data-hour={hour}
      data-date={date}
    >
      <button
        className="group relative z-10 row-span-2 cursor-pointer focus:outline-none"
        onClick={() => handleCreateEvent()}
        title={`Create event at ${hour}:00`}
      >
        <span className="absolute top-0 left-2 text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {hour < 10 ? `0${hour}:00` : `${hour}:00`}
        </span>
      </button>

      <button
        className="group cursor-pointer focus:outline-none"
        onClick={() => handleCreateEvent(true)}
        title={`Create event at ${hour}:30`}
      >
        <span className="absolute top-10 left-2 text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {hour < 10 ? `0${hour}:30` : `${hour}:30`}
        </span>
      </button>
    </div>
  );
};

export default CalendarCell;
