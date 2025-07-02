import dayjs from 'dayjs';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export function isAllDayEvent(event: Pick<CalendarEvent, 'start_at' | 'end_at'>): boolean {
  const start = dayjs(event.start_at);
  const end = dayjs(event.end_at);
  const isStartAtMidnight = start.hour() === 0 && start.minute() === 0 && start.second() === 0;
  const isEndAtMidnight = end.hour() === 0 && end.minute() === 0 && end.second() === 0;
  const durationHours = end.diff(start, 'hour');
  const isMultipleOf24Hours = durationHours > 0 && durationHours % 24 === 0;
  return isStartAtMidnight && isEndAtMidnight && isMultipleOf24Hours;
} 