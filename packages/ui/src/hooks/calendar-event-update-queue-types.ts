import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export interface PendingEventUpdate extends Partial<CalendarEvent> {
  _updateId?: string;
  _timestamp: number;
  _eventId: string;
  _previousEvent?: CalendarEvent;
  _resolvers?: Array<{
    resolve: (value: CalendarEvent) => void;
    reject: (reason: unknown) => void;
  }>;
}
