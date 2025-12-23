import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type dayjs from 'dayjs';

export interface DateRange {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
}

export interface Event {
  id: string;
  name: string;
  range: DateRange;
  taskId: string;
  partNumber?: number;
  totalParts?: number;
  locked?: boolean;
  reason?: string;
}
export type TimeOfDayPreference = 'morning' | 'afternoon' | 'evening' | 'night';

export interface Task {
  id: string;
  name: string;
  duration: number;
  minDuration: number;
  maxDuration: number;
  category: 'work' | 'personal' | 'meeting';
  priority: TaskPriority;
  deadline?: dayjs.Dayjs;
  allowSplit?: boolean;
  streak?: number;
  energyLoad?: 'high' | 'medium' | 'low';
  isHabit?: boolean;
  timePreference?: TimeOfDayPreference;
}

export type EnergyProfile =
  | 'morning_person'
  | 'night_owl'
  | 'afternoon_peak'
  | 'evening_peak';

export interface SchedulingSettings {
  min_buffer?: number;
  preferred_buffer?: number;
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

// ============================================================================
// Web Integration Types
// These types bridge the web app task format to the scheduling algorithm
// ============================================================================

export type CalendarHoursType =
  | 'work_hours'
  | 'personal_hours'
  | 'meeting_hours';

/**
 * Input format for scheduling tasks from the web app
 */
export interface WebTaskInput {
  id: string;
  name?: string | null;
  description?: string | null;
  total_duration?: number | null; // hours
  is_splittable?: boolean | null;
  min_split_duration_minutes?: number | null;
  max_split_duration_minutes?: number | null;
  calendar_hours?: CalendarHoursType | null;
  priority?: TaskPriority | null;
  start_date?: string | null;
  end_date?: string | null; // deadline
  streak?: number | null;
  energy_load?: 'high' | 'medium' | 'low' | null;
  is_habit?: boolean | null;
}

/**
 * Existing calendar event from the web app
 */
export interface WebCalendarEvent {
  id?: string;
  start_at: string;
  end_at: string;
}

/**
 * Result of scheduling with web-friendly format
 */
export interface WebScheduleResult {
  success: boolean;
  events: Array<{
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    task_id: string;
    partNumber?: number;
    totalParts?: number;
    reason?: string;
  }>;
  totalScheduledMinutes: number;
  message: string;
  warning?: string;
  logs: Log[];
}

export interface SchedulingWeights {
  habitIdealTimeBonus?: number;
  habitPreferenceBonus?: number;
  taskPreferenceBonus?: number;
  taskBaseEarlyBonus?: number;
}
