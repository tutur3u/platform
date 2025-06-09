import dayjs from 'dayjs';

interface DateRange {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
}

interface Event {
  id: string;
  name: string;
  range: DateRange;
}

interface Task {
  id: string;
  name: string;
  duration: number;
  events: Event[];
}

interface ActiveHours {
  personal: DateRange[];
  work: DateRange[];
  meeting: DateRange[];
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

// export const schedule = (events: Event[], tasks: Task[]) => {};
