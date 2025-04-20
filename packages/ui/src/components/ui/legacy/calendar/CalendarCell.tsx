import { useCalendar } from '../../../../hooks/use-calendar';
import { HOUR_HEIGHT } from './config';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useState } from 'react';

interface CalendarCellProps {
  date: string;
  hour: number;
}

const CalendarCell = ({ date, hour }: CalendarCellProps) => {
  const { addEmptyEvent } = useCalendar();
  const [isHovering, setIsHovering] = useState(false);

  const id = `cell-${date}-${hour}`;

  // Format time for display - only show when hovering
  const formatTime = (hour: number, minute: number = 0) => {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return format(date, 'h:mm a');
  };

  const handleCreateEvent = (midHour?: boolean) => {
    const newDate = new Date(date);
    newDate.setHours(hour, midHour ? 30 : 0, 0, 0);
    addEmptyEvent(newDate);
  };

  return (
    <div
      id={id}
      className={cn(
        'calendar-cell relative transition-colors',
        hour !== 0 && 'border-border/30 border-t',
        isHovering ? 'bg-muted/20' : 'hover:bg-muted/10'
      )}
      style={{
        height: `${HOUR_HEIGHT}px`,
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      data-hour={hour}
      data-date={date}
    >
      {/* Full cell clickable area */}
      <button
        className="absolute inset-0 h-1/2 w-full cursor-pointer focus:outline-none"
        onClick={() => handleCreateEvent()}
        title={`Create event at ${formatTime(hour)}`}
      >
        {/* Only show time on hover */}
        {isHovering && (
          <span className="text-muted-foreground/70 absolute left-2 top-2 text-xs font-medium">
            {formatTime(hour)}
          </span>
        )}
      </button>

      {/* Half-hour marker */}
      <div className="border-border/30 absolute left-0 right-0 top-1/2 border-t border-dashed dark:border-zinc-800/50" />

      {/* Half-hour clickable area */}
      <button
        className="absolute inset-x-0 top-1/2 h-1/2 cursor-pointer focus:outline-none"
        onClick={() => handleCreateEvent(true)}
        title={`Create event at ${formatTime(hour, 30)}`}
      >
        {/* Only show time on hover */}
        {isHovering && (
          <span className="text-muted-foreground/70 absolute left-2 top-2 text-xs font-medium">
            {formatTime(hour, 30)}
          </span>
        )}
      </button>
    </div>
  );
};

export default CalendarCell;
