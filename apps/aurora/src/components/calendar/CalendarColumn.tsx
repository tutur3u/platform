import CalendarCell from './CalendarCell';

interface CalendarColumnProps {
  date: string;
}

const CalendarColumn = ({ date }: CalendarColumnProps) => {
  const hours = Array.from(Array(24).keys());

  return (
    <div className="grid grid-rows-[24]">
      {hours.map((hour) => (
        <CalendarCell key={`${date}-${hour}`} date={date} hour={hour} />
      ))}
    </div>
  );
};

export default CalendarColumn;
