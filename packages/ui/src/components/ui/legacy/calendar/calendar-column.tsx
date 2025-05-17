import { cn } from '@tuturuuu/utils/format';
import { CalendarCell } from './calendar-cell';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';

interface CalendarColumnProps {
  date: string;
  last: boolean;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
}

export const CalendarColumn = ({ date, last, isDragging, setIsDragging }: CalendarColumnProps) => {
  const hours = Array.from(Array(24).keys());

  return (
    <div
      className={cn(
        'border-border/30 relative grid border border-r',
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
        <CalendarCell key={`${date}-${hour}`} date={date} hour={hour} isDragging={isDragging} setIsDragging={setIsDragging} />
      ))}
    </div>
  );
};
