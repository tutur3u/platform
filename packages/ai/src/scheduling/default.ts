import type { ActiveHours, Task } from './types';
import dayjs from 'dayjs';

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

export const defaultTasks: Task[] = [];
