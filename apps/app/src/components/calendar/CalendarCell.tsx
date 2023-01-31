import { useCalendar } from '../../hooks/useCalendar';

interface CalendarCellProps {
  date: string;
  hour: number;
}

const CalendarCell = ({ date, hour }: CalendarCellProps) => {
  const id = `cell-${date}-${hour}`;

  const { addEmptyEvent } = useCalendar();

  const handleCreateEvent = (midHour?: boolean) => {
    const newDate = new Date(date);

    newDate.setDate(newDate.getDate() + 1);
    newDate.setHours(hour, midHour ? 30 : 0, 0, 0);

    addEmptyEvent(newDate);
  };

  return (
    <div
      id={id}
      className="calendar-cell grid h-20 border-l border-b border-zinc-800"
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      <button
        className="row-span-2 cursor-default"
        onClick={() => handleCreateEvent()}
      />
      <button
        className="cursor-default"
        onClick={() => handleCreateEvent(true)}
      />
    </div>
  );
};

export default CalendarCell;
