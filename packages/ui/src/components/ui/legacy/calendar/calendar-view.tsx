import { CalendarMatrix } from './calendar-matrix';
import { TimeIndicator } from './time-indicator';

export const CalendarView = ({
  dates,
  overlay,
}: {
  dates: Date[];
  overlay?: React.ReactNode;
}) => {
  const columns = dates.length;

  // Create a dynamic grid template based on the number of columns
  const gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;

  return (
    <div
      className="relative flex-1"
      style={{
        display: 'grid',
        gridTemplateColumns,
      }}
    >
      <CalendarMatrix dates={dates} overlay={overlay} />
      <TimeIndicator dates={dates} />
    </div>
  );
};
