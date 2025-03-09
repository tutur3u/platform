import CalendarCell from './CalendarCell';

// Constants for grid calculations
const HOUR_HEIGHT = 80; // Height of one hour in pixels
const DAY_HEIGHT = 24 * HOUR_HEIGHT; // Total height of a day (24 hours)

interface CalendarColumnProps {
  date: string;
}

const CalendarColumn = ({ date }: CalendarColumnProps) => {
  const hours = Array.from(Array(24).keys());

  return (
    <div
      className="grid border-r dark:border-zinc-800"
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
