import type { TaskPriority } from './Priority';
import type { CalendarHoursType } from './Task';

// ============================================================================
// ENUMS
// ============================================================================

export const HabitFrequencies = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom',
] as const;
export type HabitFrequency = (typeof HabitFrequencies)[number];

export const isHabitFrequency = (v: unknown): v is HabitFrequency =>
  typeof v === 'string' && (HabitFrequencies as readonly string[]).includes(v);

export const TimeOfDayPreferences = [
  'morning', // 6am-12pm
  'afternoon', // 12pm-5pm
  'evening', // 5pm-9pm
  'night', // 9pm-12am
] as const;
export type TimeOfDayPreference = (typeof TimeOfDayPreferences)[number];

export const isTimeOfDayPreference = (v: unknown): v is TimeOfDayPreference =>
  typeof v === 'string' &&
  (TimeOfDayPreferences as readonly string[]).includes(v);

export const MonthlyRecurrenceTypes = ['day_of_month', 'day_of_week'] as const;
export type MonthlyRecurrenceType = (typeof MonthlyRecurrenceTypes)[number];

export const isMonthlyRecurrenceType = (
  v: unknown
): v is MonthlyRecurrenceType =>
  typeof v === 'string' &&
  (MonthlyRecurrenceTypes as readonly string[]).includes(v);

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Core Habit interface representing a recurring activity
 */
export interface Habit {
  id: string;
  ws_id: string;
  creator_id?: string | null;

  // Basic info
  name: string;
  description?: string | null;
  color: string;

  // Scheduling category
  calendar_hours: CalendarHoursType;
  priority: TaskPriority;

  // Duration constraints (in minutes)
  duration_minutes: number;
  min_duration_minutes?: number | null;
  max_duration_minutes?: number | null;

  // Time preferences
  ideal_time?: string | null; // TIME as string "HH:MM"
  time_preference?: TimeOfDayPreference | null;

  // Recurrence settings
  frequency: HabitFrequency;
  recurrence_interval: number;

  // Weekly: which days (0=Sunday, 1=Monday, ..., 6=Saturday)
  days_of_week?: number[] | null;

  // Monthly settings
  monthly_type?: MonthlyRecurrenceType | null;
  day_of_month?: number | null; // 1-31 for day_of_month type
  week_of_month?: number | null; // 1-5 for day_of_week type (5 = last)
  day_of_week_monthly?: number | null; // 0-6 for day_of_week type

  // Date bounds
  start_date: string;
  end_date?: string | null; // NULL = no end date

  // Status
  is_active: boolean;
  auto_schedule: boolean;
  is_visible_in_calendar: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/**
 * Junction record linking a habit to a calendar event
 */
export interface HabitCalendarEvent {
  id: string;
  habit_id: string;
  event_id: string;
  occurrence_date: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Record of a habit completion for streak tracking
 */
export interface HabitCompletion {
  id: string;
  habit_id: string;
  occurrence_date: string;
  completed_at: string;
  event_id?: string | null;
  created_at: string;
}

/**
 * Streak statistics for a habit
 */
export interface HabitStreak {
  current_streak: number;
  best_streak: number;
  total_completions: number;
  completion_rate: number; // Percentage (0-100)
  last_completed_at?: string | null;
}

/**
 * Habit with its scheduled calendar events and streak info
 */
export interface HabitWithEvents extends Habit {
  calendar_events?: Array<{
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    occurrence_date: string;
    completed: boolean;
  }>;
  streak?: HabitStreak;
}

/**
 * Schedulable habit with computed effective priority
 * Used by the unified scheduler for priority-based scheduling
 */
export interface SchedulableHabit extends Habit {
  /** Computed effective priority (defaults to 'normal' if not set) */
  effective_priority: TaskPriority;
  /** Computed minimum duration (defaults to duration_minutes * 0.5 if not set) */
  effective_min_duration: number;
  /** Computed maximum duration (defaults to duration_minutes * 1.5 if not set) */
  effective_max_duration: number;
}

/**
 * Input for creating or updating a habit
 */
export interface HabitInput {
  name: string;
  description?: string | null;
  color?: string;

  calendar_hours?: CalendarHoursType;
  priority?: TaskPriority;

  duration_minutes: number;
  min_duration_minutes?: number | null;
  max_duration_minutes?: number | null;

  ideal_time?: string | null;
  time_preference?: TimeOfDayPreference | null;

  frequency: HabitFrequency;
  recurrence_interval?: number;
  days_of_week?: number[] | null;

  monthly_type?: MonthlyRecurrenceType | null;
  day_of_month?: number | null;
  week_of_month?: number | null;
  day_of_week_monthly?: number | null;

  start_date: string;
  end_date?: string | null;

  is_active?: boolean;
  auto_schedule?: boolean;
  is_visible_in_calendar?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get time range for a time-of-day preference
 */
export function getTimeRangeForPreference(preference: TimeOfDayPreference): {
  start: string;
  end: string;
} {
  switch (preference) {
    case 'morning':
      return { start: '06:00', end: '12:00' };
    case 'afternoon':
      return { start: '12:00', end: '17:00' };
    case 'evening':
      return { start: '17:00', end: '21:00' };
    case 'night':
      return { start: '21:00', end: '24:00' };
  }
}

/**
 * Get a human-readable description of the recurrence pattern
 */
export function getRecurrenceDescription(habit: Habit): string {
  const { frequency, recurrence_interval, days_of_week } = habit;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  switch (frequency) {
    case 'daily':
      return recurrence_interval === 1
        ? 'Every day'
        : `Every ${recurrence_interval} days`;

    case 'weekly':
      if (days_of_week && days_of_week.length > 0) {
        const daysList = days_of_week
          .sort((a, b) => a - b)
          .map((d) => dayNames[d])
          .join(', ');
        return recurrence_interval === 1
          ? `Every ${daysList}`
          : `Every ${recurrence_interval} weeks on ${daysList}`;
      }
      return recurrence_interval === 1
        ? 'Every week'
        : `Every ${recurrence_interval} weeks`;

    case 'monthly':
      if (habit.monthly_type === 'day_of_month' && habit.day_of_month) {
        const suffix = getOrdinalSuffix(habit.day_of_month);
        return recurrence_interval === 1
          ? `Every month on the ${habit.day_of_month}${suffix}`
          : `Every ${recurrence_interval} months on the ${habit.day_of_month}${suffix}`;
      }
      if (
        habit.monthly_type === 'day_of_week' &&
        habit.week_of_month != null &&
        habit.day_of_week_monthly != null
      ) {
        const weekNames = ['1st', '2nd', '3rd', '4th', 'last'];
        const weekName =
          habit.week_of_month === 5
            ? 'last'
            : weekNames[habit.week_of_month - 1];
        const dayName = dayNames[habit.day_of_week_monthly];
        return recurrence_interval === 1
          ? `Every month on the ${weekName} ${dayName}`
          : `Every ${recurrence_interval} months on the ${weekName} ${dayName}`;
      }
      return recurrence_interval === 1
        ? 'Every month'
        : `Every ${recurrence_interval} months`;

    case 'yearly':
      return recurrence_interval === 1
        ? 'Every year'
        : `Every ${recurrence_interval} years`;

    case 'custom':
      return `Every ${recurrence_interval} days`;

    default:
      return 'Unknown frequency';
  }
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0] || 'th';
}
