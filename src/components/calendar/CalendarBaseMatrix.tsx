import { useCalendar } from '../../hooks/useCalendar';
import CalendarColumn from './CalendarColumn';

const CalendarBaseMatrix = () => {
  const { getDatesInView } = useCalendar();
  const dates = getDatesInView();

  return (
    <>
      {dates.map((_, index) => (
        <CalendarColumn key={index} />
      ))}
    </>
  );
};

export default CalendarBaseMatrix;
