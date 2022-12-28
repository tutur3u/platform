import { useCalendar } from '../../hooks/useCalendar';
import CalendarMatrix from './CalendarMatrix';
import CalendarEventPlanner from './CalendarEventPlanner';
import TimeIndicator from './TimeIndicator';

const CalendarView = () => {
  const { getDatesInView } = useCalendar();

  const dates = getDatesInView();
  const columns = dates.length;

  return (
    <div className={`relative grid flex-1 grid-cols-${columns}`}>
      <CalendarMatrix />
      <CalendarEventPlanner />
      <TimeIndicator />
    </div>
  );
};

export default CalendarView;
