import CalendarCell from './CalendarCell';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';
import { cn } from '@tuturuuu/utils/format';

interface CalendarColumnProps {
  date: string;
  last: boolean;
}

const CalendarColumn = ({ date, last }: CalendarColumnProps) => {
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
    >
      {hours.map((hour) => (
        <CalendarCell key={`${date}-${hour}`} date={date} hour={hour} />
      ))}
    </div>
  );
};

export default CalendarColumn;
