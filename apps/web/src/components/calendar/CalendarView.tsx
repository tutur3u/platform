import CalendarMatrix from './CalendarMatrix';
import TimeIndicator from './TimeIndicator';

const CalendarView = ({ dates }: { dates: Date[] }) => {
  const columns = dates.length;

  return (
    <div className={`relative grid flex-1 grid-cols-${columns}`}>
      <CalendarMatrix dates={dates} />
      <TimeIndicator />
    </div>
  );
};

export default CalendarView;
