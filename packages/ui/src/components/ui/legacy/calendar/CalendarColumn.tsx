import CalendarCell from './CalendarCell';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';

interface CalendarColumnProps {
  date: string;
}

const CalendarColumn = ({ date }: CalendarColumnProps) => {
  const hours = Array.from(Array(24).keys());

  return (
    <div
      className="grid border border-r border-border/30"
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
