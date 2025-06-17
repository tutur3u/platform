import dayjs from 'dayjs';

export interface DateRange {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
}

export interface Event {
  id: string;
  name: string;
  range: DateRange;
  isPastDeadline?: boolean;
}

export interface Task {
  id: string;
  name: string;
  duration: number;
  events: Event[];
  deadline?: dayjs.Dayjs;
}

export interface ActiveHours {
  personal: DateRange[];
  work: DateRange[];
  meeting: DateRange[];
}

export interface Log {
  type: 'warning' | 'error';
  message: string;
}

export interface ScheduleResult {
  events: Event[];
  logs: Log[];
}

export const defaultActiveHours: ActiveHours = {
  personal: [
    {
      start: dayjs().hour(7).minute(0).second(0).millisecond(0),
      end: dayjs().hour(23).minute(0).second(0).millisecond(0),
    },
  ],
  work: [
    {
      start: dayjs().hour(9).minute(0).second(0).millisecond(0),
      end: dayjs().hour(17).minute(0).second(0).millisecond(0),
    },
  ],
  meeting: [
    {
      start: dayjs().hour(9).minute(0).second(0).millisecond(0),
      end: dayjs().hour(17).minute(0).second(0).millisecond(0),
    },
  ],
};

export const defaultTasks: Task[] = [
  {
    id: 'task-1',
    name: 'Task 1',
    duration: 1,
    events: [],
  },
];

export const scheduleTasks = (
  tasks: Task[],
  activeHours: ActiveHours = defaultActiveHours
): ScheduleResult => {
  const scheduledEvents: Event[] = [];
  const logs: Log[] = [];

  // Sort tasks by deadline, earliest first. Tasks without a deadline are considered last.
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.deadline && b.deadline)
      return a.deadline.isBefore(b.deadline) ? -1 : 1;
    if (a.deadline) return -1; // a has a deadline, b doesn't
    if (b.deadline) return 1; // b has a deadline, a doesn't
    return 0; // no deadlines
  });

  const workHours = activeHours.work[0];

  if (!workHours) {
    logs.push({
      type: 'error',
      message: 'No work hours defined to schedule tasks.',
    });
    return { events: [], logs };
  }

  let availableTime = dayjs().isAfter(workHours.start)
    ? dayjs()
    : workHours.start.clone();

  for (const task of sortedTasks) {
    let taskStart = availableTime.clone();

    const workDayEnd = workHours.end
      .year(taskStart.year())
      .month(taskStart.month())
      .date(taskStart.date());
    const workDayStart = workHours.start
      .year(taskStart.year())
      .month(taskStart.month())
      .date(taskStart.date());

    if (taskStart.isAfter(workDayEnd)) {
      taskStart = workDayStart.add(1, 'day');
    }

    if (taskStart.isBefore(workDayStart)) {
      taskStart = workDayStart;
    }

    let taskEnd = taskStart.add(task.duration, 'hour');

    if (taskEnd.isAfter(workDayEnd)) {
      logs.push({
        type: 'warning',
        message: `Task "${task.name}" does not fit into the remaining time of the day. Moving to the next available slot.`,
      });

      taskStart = workDayStart.add(1, 'day');
      taskEnd = taskStart.add(task.duration, 'hour');

      const nextWorkDayEnd = workHours.end
        .year(taskStart.year())
        .month(taskStart.month())
        .date(taskStart.date());
      if (taskEnd.isAfter(nextWorkDayEnd)) {
        logs.push({
          type: 'error',
          message: `Task "${task.name}" (${task.duration}h) is longer than a single work day and could not be scheduled properly.`,
        });
      }
    }

    const newEvent: Event = {
      id: `event-${task.id}`,
      name: task.name,
      range: { start: taskStart, end: taskEnd },
      isPastDeadline: false,
    };

    if (task.deadline && taskEnd.isAfter(task.deadline)) {
      newEvent.isPastDeadline = true;
      logs.push({
        type: 'warning',
        message: `Task "${
          task.name
        }" is scheduled past its deadline of ${task.deadline.format(
          'YYYY-MM-DD HH:mm'
        )}.`,
      });
    }

    scheduledEvents.push(newEvent);
    availableTime = taskEnd;
  }

  return { events: scheduledEvents, logs };
};
