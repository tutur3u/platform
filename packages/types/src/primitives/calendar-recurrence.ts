/** Versioned common recurrence contract; provider identity is stored separately. */
export type CalendarWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
export interface CalendarRecurrenceRule {
  version: 1;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  timeZone: string;
  weekStartsOn?: CalendarWeekday;
  weekdays?: CalendarWeekday[];
  monthDay?: number;
  /** Outlook clamps absent month dates; RFC rules otherwise skip them. */
  monthDayOverflow?: 'skip' | 'last-day';
  weekIndex?: 1 | 2 | 3 | 4 | -1;
  month?: number;
  end:
    | { type: 'never' }
    | { type: 'count'; count: number }
    | { type: 'until'; date: string };
}
export interface CalendarRecurrenceAnchor {
  /** Local date-time, without offset; midnight for all-day events. */
  startLocal: string;
  endLocal: string;
  allDay: boolean;
}
export interface CalendarRecurrenceException {
  /** Immutable original wall-clock slot, even after an occurrence is moved. */
  originalStartLocal: string;
  cancelled?: boolean;
  startLocal?: string;
  endLocal?: string;
}
export interface CalendarRecurrenceOccurrence {
  originalStartLocal: string;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  isException: boolean;
}
