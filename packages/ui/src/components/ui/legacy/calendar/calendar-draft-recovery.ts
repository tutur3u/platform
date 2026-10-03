import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export function createCalendarDraftRecovery() {
  let submitted:
    | {
        payload: Partial<CalendarEvent>;
        requestId: string;
        recoverable: boolean;
      }
    | undefined;
  let recovered: CalendarEvent | undefined;
  return {
    original: () => recovered,
    submitted: () => submitted,
    capture(
      payload: Partial<CalendarEvent>,
      requestId: string,
      recoverable: boolean
    ) {
      // Snapshot once. An uncertain request never changes its ID or contents.
      submitted ??= {
        payload: structuredClone(payload),
        requestId,
        recoverable,
      };
      return submitted;
    },
    complete(event: CalendarEvent) {
      if (!event.id || event.id === 'new')
        throw new Error('Unconfirmed creation');
      recovered = event;
    },
  };
}
