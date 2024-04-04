import CalendarColumn from './CalendarColumn';

const CalendarBaseMatrix = ({ dates }: { dates: Date[] }) => {
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
