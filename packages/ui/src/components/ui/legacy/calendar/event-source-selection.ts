import type {
  CalendarSourceInput,
  CalendarSourceOption,
} from '@tuturuuu/internal-api';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export function sourceInputFromOption(
  option?: CalendarSourceOption | null
): CalendarSourceInput | undefined {
  if (!option) return undefined;

  if (option.provider === 'tuturuuu') {
    return {
      provider: 'tuturuuu',
      workspaceCalendarId: option.workspaceCalendarId,
    };
  }

  return {
    provider: option.provider,
    connectionId: option.connectionId,
  };
}

export function findEventSourceOption(
  options: CalendarSourceOption[],
  event: Partial<CalendarEvent>
) {
  if (event.provider === 'google' || event.provider === 'microsoft') {
    const matches = options.filter((option) => {
      if (option.provider === 'tuturuuu' || option.provider !== event.provider)
        return false;
      if (event.source_calendar_id)
        return option.workspaceCalendarId === event.source_calendar_id;
      return (
        option.externalCalendarId ===
        (event.external_calendar_id ?? event.google_calendar_id)
      );
    });
    // Legacy rows without a canonical source must not choose another account
    // merely because it contains the same provider calendar ID.
    return matches.length === 1 ? matches[0] : undefined;
  }

  return options.find(
    (option) =>
      option.provider === 'tuturuuu' &&
      option.workspaceCalendarId === event.source_calendar_id
  );
}

export function selectedEventSource(
  options: CalendarSourceOption[],
  event: Partial<CalendarEvent>,
  selectedId: string | null,
  defaultSource?: CalendarSourceOption
) {
  const selected = options.find((option) => option.id === selectedId);
  const existing = !!event.id && event.id !== 'new';
  return (
    selected ??
    findEventSourceOption(options, event) ??
    (existing ? undefined : (defaultSource ?? options[0]))
  );
}
export function eventSourceChanged(
  options: CalendarSourceOption[],
  event: Partial<CalendarEvent>,
  selectedId: string | null
) {
  return (
    selectedId !== null &&
    options.some((option) => option.id === selectedId) &&
    selectedId !== findEventSourceOption(options, event)?.id
  );
}
