import tasks from '../../data/tasks';
import { useCalendar } from '../../hooks/useCalendar';
import EventCard from './EventCard';
import TimeIndicator from './TimeIndicator';

const CalendarView = () => {
  const { getDatesInView } = useCalendar();

  const days = getDatesInView();

  const placeTasks = () => {
    const tasksOnCalendar = days.map((day) => {
      const tasksOnDay = tasks.filter((task) => {
        if (task.start.getDate() === day.getDate()) return true;
        return false;
      });

      const tasksOnDayPlaced: {
        id: number;
        title: string;
        duration: number;
        startAt: Date;
      }[] = [];

      tasksOnDay.forEach((task) => {
        const taskStart = task.start.getHours() + task.start.getMinutes() / 60;
        const taskEnd = task.end.getHours() + task.end.getMinutes() / 60;

        const taskDuration = taskEnd - taskStart;

        const taskPlaced = {
          id: task.id,
          title: task.title,
          duration: taskDuration,
          startAt: task.start,
        };

        tasksOnDayPlaced.push(taskPlaced);
      });

      return {
        date: day,
        tasks: tasksOnDayPlaced,
      };
    });

    return tasksOnCalendar;
  };

  const placedTasks = placeTasks();

  return (
    <div className="flex overflow-y-scroll border-b border-zinc-800 text-center scrollbar-none">
      <div className="grid w-16 grid-rows-[24]">
        {Array.from(Array(24).keys()).map((hour, index) => (
          <div
            key={index}
            className={`relative flex h-20 w-full min-w-fit items-center justify-end text-xl font-semibold ${
              hour === 23 ? 'border-b border-zinc-800' : 'translate-y-3'
            }`}
          >
            <span className="absolute right-0 bottom-0 px-2">
              {hour < 23 ? hour + 1 + ':00' : null}
            </span>
          </div>
        ))}
      </div>

      <div className={`relative grid flex-1 grid-cols-${days.length}`}>
        {days.map((_, index) => (
          <div key={index} className="grid grid-rows-[24]">
            {Array.from(Array(24).keys()).map((index) => (
              <div
                key={index}
                className="grid h-20 border-l border-b border-zinc-800"
              />
            ))}
          </div>
        ))}

        <div className={`absolute inset-0 grid grid-cols-${days.length}`}>
          {placedTasks &&
            placedTasks.map((day) => (
              <div
                key={day.date.getDate()}
                className="relative grid grid-rows-[24]"
              >
                {day.tasks.map((task) => (
                  <EventCard key={task.id} data={task} />
                ))}
              </div>
            ))}
        </div>

        <TimeIndicator />
      </div>
    </div>
  );
};

export default CalendarView;
