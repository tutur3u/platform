import { useCallback, useEffect, useState } from 'react';
import EventCard from './EventCard';

interface CalendarEventColumnProps {
  data: {
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  }[];
}

const CalendarEventColumn = ({ data }: CalendarEventColumnProps) => {
  const [tasks, setTasks] = useState<
    {
      id: number;
      title: string;
      duration: number;
      startAt: Date;
      level: number;
    }[]
  >(data.map((task) => ({ ...task, level: 0 })));

  const handleTaskUpdate = (task: {
    id: number;
    title: string;
    duration: number;
    startAt: Date;
  }) => {
    setTasks((prev) => {
      const newTasks = [...prev];
      const taskIndex = newTasks.findIndex((t) => t.id === task.id);
      newTasks[taskIndex] = { ...task, level: getTaskLevel(task) };
      return newTasks;
    });
  };

  const getTaskLevel = useCallback(
    (task: { id: number; title: string; duration: number; startAt: Date }) => {
      // This function should count the number of chained tasks that are directly, or indirectly, before the current task
      // If the task is the first task of the day, it should return 0
      const taskIndex = tasks.findIndex((t) => t.id === task.id);
      if (taskIndex === 0) return 0;

      const tasksBefore = tasks.slice(0, taskIndex);
      const tasksBeforeChained = tasksBefore.filter((t) => {
        const taskStart = t.startAt.getHours() + t.startAt.getMinutes() / 60;
        const taskEnd = taskStart + t.duration;
        const currentTaskStart =
          task.startAt.getHours() + task.startAt.getMinutes() / 60;
        return taskEnd > currentTaskStart;
      });

      if (tasksBeforeChained.length === 0) return 0;

      const tasksBeforeChainedLevels = tasksBeforeChained.map((t) => t.level);
      const maxLevel = Math.max(...tasksBeforeChainedLevels);
      return maxLevel + 1;
    },
    [tasks]
  );

  useEffect(() => {
    // refresh tasks levels
    setTasks((prev) => {
      const newTasks = [...prev];
      newTasks.forEach((task) => {
        task.level = getTaskLevel(task);
      });
      return newTasks;
    });
  }, [data, getTaskLevel]);

  return (
    <div className="relative">
      {tasks.map((task) => (
        <EventCard
          key={task.id}
          data={task}
          getLevel={getTaskLevel}
          onUpdated={handleTaskUpdate}
        />
      ))}
    </div>
  );
};

export default CalendarEventColumn;
