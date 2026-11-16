import { cleanText, hasRoom, SHOWCASE_LIMITS } from './limits';

export const CALENDAR_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const CALENDAR_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17] as const;

export type CalendarEvent = {
  id: number;
  title: string;
  /** Index into CALENDAR_DAYS. */
  day: number;
  /** Start hour from CALENDAR_HOURS; every event lasts one hour. */
  hour: number;
};

export type CalendarState = { events: CalendarEvent[]; nextId: number };

export type CalendarAction =
  | { type: 'add'; title: string; day: number; hour: number }
  | { type: 'reschedule'; id: number; day: number; hour: number }
  | { type: 'remove'; id: number }
  | { type: 'reset' };

export const initialCalendarState: CalendarState = {
  events: [
    { id: 1, title: 'Team stand-up', day: 0, hour: 9 },
    { id: 2, title: 'Design review', day: 1, hour: 14 },
    { id: 3, title: 'Customer call', day: 3, hour: 11 },
  ],
  nextId: 4,
};

export function isValidSlot(day: number, hour: number): boolean {
  return (
    Number.isInteger(day) &&
    day >= 0 &&
    day < CALENDAR_DAYS.length &&
    (CALENDAR_HOURS as readonly number[]).includes(hour)
  );
}

export function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}

export function formatSlot(event: Pick<CalendarEvent, 'day' | 'hour'>) {
  return `${CALENDAR_DAYS[event.day] ?? ''} ${formatHour(event.hour)}`;
}

/** Events sharing a slot with another event. */
export function findConflicts(events: readonly CalendarEvent[]): Set<number> {
  const seen = new Map<string, number>();
  const conflicts = new Set<number>();
  for (const event of events) {
    const key = `${event.day}:${event.hour}`;
    const other = seen.get(key);
    if (other !== undefined) {
      conflicts.add(other);
      conflicts.add(event.id);
    } else {
      seen.set(key, event.id);
    }
  }
  return conflicts;
}

export function sortEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => a.day - b.day || a.hour - b.hour);
}

export function calendarReducer(
  state: CalendarState,
  action: CalendarAction
): CalendarState {
  switch (action.type) {
    case 'add': {
      const title = cleanText(action.title, SHOWCASE_LIMITS.titleLength);
      if (
        !title ||
        !isValidSlot(action.day, action.hour) ||
        !hasRoom(state.events, SHOWCASE_LIMITS.listItems)
      )
        return state;
      return {
        events: [
          ...state.events,
          { id: state.nextId, title, day: action.day, hour: action.hour },
        ],
        nextId: state.nextId + 1,
      };
    }
    case 'reschedule':
      if (!isValidSlot(action.day, action.hour)) return state;
      return {
        ...state,
        events: state.events.map((event) =>
          event.id === action.id
            ? { ...event, day: action.day, hour: action.hour }
            : event
        ),
      };
    case 'remove':
      return {
        ...state,
        events: state.events.filter((event) => event.id !== action.id),
      };
    case 'reset':
      return initialCalendarState;
  }
}
