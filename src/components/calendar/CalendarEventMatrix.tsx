import { useState } from 'react';
import mockTasks from '../../data/tasks';
import { useCalendar } from '../../hooks/useCalendar';
import CalendarEventColumn from './CalendarEventColumn';

const CalendarEventMatrix = () => {
  const [tasks] = useState(mockTasks);
  const { getDatesInView } = useCalendar();

  const dates = getDatesInView();
  const columns = dates.length;

  const placeTasks = () => {
    const tasksOnCalendar = dates.map((day) => {
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

  const placedColumns = placedTasks
    ? placedTasks.map((date) => (
        <CalendarEventColumn key={date.date.toString()} data={date.tasks} />
      ))
    : null;

  return (
    <div
      className={`absolute inset-0 grid grid-cols-${columns} ${
        dates.length === 1 && 'max-w-lg'
      }`}
    >
      {placedColumns}
    </div>
  );
};

export default CalendarEventMatrix;
