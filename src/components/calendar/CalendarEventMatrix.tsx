import { useCallback, useEffect, useState } from 'react';
import mockTasks from '../../data/tasks';
import { useCalendar } from '../../hooks/useCalendar';
import { CalendarEvent } from '../../types/primitives/CalendarEvent';
import CalendarEventColumn from './CalendarEventColumn';

const CalendarEventMatrix = () => {
  const [events, setTasks] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    setTasks(mockTasks);
  }, []);

  const { getDatesInView } = useCalendar();

  const dates = getDatesInView();
  const columns = dates.length;

  const convertToColumns = () => {
    const eventsOnCalendar = dates.map((day) => {
      const eventsOnDay = events.filter((task) => {
        if (task.start_at.getDate() === day.getDate()) return true;
        return false;
      });

      return {
        date: day,
        events: eventsOnDay,
      };
    });

    return eventsOnCalendar;
  };

  const handleTaskUpdate = (task: CalendarEvent) => {
    setTasks((prev) => {
      const newTasks = [...prev];
      newTasks
        .sort((a, b) => a.start_at.getTime() - b.start_at.getTime())
        .forEach((t) => {
          if (t.id === task.id) {
            t.title = task.title;
            t.start_at = task.start_at;
            t.end_at = task.end_at;
          }

          t.level = getTaskLevel(t);
        });
      return newTasks;
    });
  };

  const getTaskLevel = useCallback(
    (task: CalendarEvent) => {
      // Find index of task in events array
      const taskIndex = events.findIndex((t) => t.id === task.id);

      // If task is first in the list, it has no level
      if (taskIndex === 0) return 0;

      const eventsBefore = events.slice(0, taskIndex);
      const eventsBeforeChained = eventsBefore.filter((t) => {
        const taskStart = task.start_at.getTime();
        const taskEnd = task.end_at.getTime();

        const tStart = t.start_at.getTime();
        const tEnd = t.end_at.getTime();

        if (tStart >= taskStart && tStart < taskEnd) return true;
        if (tEnd > taskStart && tEnd <= taskEnd) return true;
        if (tStart <= taskStart && tEnd >= taskEnd) return true;
        return false;
      });

      if (eventsBeforeChained.length === 0) return 0;

      const eventsBeforeChainedLevels = eventsBeforeChained.map(
        (t) => t?.level ?? 0
      );
      const maxLevel = Math.max(...eventsBeforeChainedLevels);
      return maxLevel + 1;
    },
    [events]
  );

  const eventColumns = convertToColumns();

  const placedColumns = eventColumns
    ? eventColumns.map((col) => (
        <CalendarEventColumn
          key={col.date.toString()}
          events={col.events}
          getTaskLevel={getTaskLevel}
          onUpdated={handleTaskUpdate}
        />
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
