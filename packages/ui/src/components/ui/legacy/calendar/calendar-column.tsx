import { CalendarCell } from './calendar-cell';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';
import { cn } from '@tuturuuu/utils/format';

interface CalendarColumnProps {
  date: string;
  last: boolean;
}

export const CalendarColumn = ({ date, last }: CalendarColumnProps) => {
  const hours = Array.from(Array(24).keys());

  return (
    <div
      className={cn(
        'relative grid border border-r border-border/30',
        last && 'border-r-border'
      )}
      style={{
        gridTemplateRows: `repeat(24, ${HOUR_HEIGHT}px)`,
        minWidth: '120px',
        height: `${DAY_HEIGHT}px`, // 24 hours * 80px = 1920px
      }}
      data-column-date={date}
    >
      {hours.map((hour) => (
        <CalendarCell key={`${date}-${hour}`} date={date} hour={hour} />
      ))}
    </div>
  );
};
