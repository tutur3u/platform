import CalendarBaseMatrix from './CalendarBaseMatrix';
import CalendarEventMatrix from './CalendarEventMatrix';

const CalendarMatrix = ({ dates }: { dates: Date[] }) => {
  return (
    <>
      <CalendarBaseMatrix dates={dates} />
      <CalendarEventMatrix dates={dates} />
    </>
  );
};

export default CalendarMatrix;
