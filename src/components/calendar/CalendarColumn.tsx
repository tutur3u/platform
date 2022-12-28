import CalendarCell from './CalendarCell';

const CalendarColumn = () => {
  const hours = Array.from(Array(24).keys());

  return (
    <div className="relative grid grid-rows-[24]">
      {hours.map((index) => (
        <CalendarCell key={index} />
      ))}
    </div>
  );
};

export default CalendarColumn;
