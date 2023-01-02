import { useCalendar } from '../../hooks/useCalendar';
import CalendarColumn from './CalendarColumn';

const CalendarBaseMatrix = () => {
  const { getDatesInView } = useCalendar();
  const dates = getDatesInView();

  return (
    <>
      {dates.map((_, index) => (
        <CalendarColumn
          key={`cal-col-${index}`}
          date={dates[index].toISOString().split('T')[0]}
        />
      ))}
    </>
  );
};

export default CalendarBaseMatrix;
