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
  taskId: string;
  partNumber?: number;
  totalParts?: number;
  locked?: boolean;
}

export interface Task {
  id: string;
  name: string;
  duration: number;
  minDuration: number;
  maxDuration: number;
  category: 'work' | 'personal' | 'meeting';
  events: Event[];
  deadline?: dayjs.Dayjs;
  allowSplit?: boolean;
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

export interface TemplateScenario {
  name: string;
  description: string;
  tasks: Task[];
  activeHours?: Partial<ActiveHours>;
}
