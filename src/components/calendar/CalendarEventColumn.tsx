import EventCard from './EventCard';

interface CalendarEventColumnProps {
  tasks: {
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  }[];
}

const CalendarEventColumn = ({ tasks }: CalendarEventColumnProps) => {
  return (
    <div className="relative">
      {tasks.map((task) => (
        <EventCard key={task.id} data={task} />
      ))}
    </div>
  );
};

export default CalendarEventColumn;
