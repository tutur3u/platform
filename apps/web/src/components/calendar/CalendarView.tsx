import { useCalendar } from '../../hooks/useCalendar';
import CalendarMatrix from './CalendarMatrix';
import TimeIndicator from './TimeIndicator';

const CalendarView = () => {
  const { datesInView: dates } = useCalendar();
  const columns = dates.length;

  return (
    <div className={`relative grid flex-1 grid-cols-${columns}`}>
      <CalendarMatrix />
      <TimeIndicator />
    </div>
  );
};

export default CalendarView;
