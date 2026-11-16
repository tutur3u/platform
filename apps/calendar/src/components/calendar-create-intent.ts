/**
 * `?create=event` asks the Calendar page to open its own New event draft once
 * on arrival (used by the workspace dashboard). The draft uses the Calendar's
 * defaults and is saved only when the user confirms it in the event dialog.
 * `date` and `eventId` keep their meaning and are never removed.
 */
export const CALENDAR_CREATE_PARAM = 'create';
export const CALENDAR_CREATE_EVENT = 'event';

export interface CalendarCreateIntent {
  /** True only for exactly one `create=event`. */
  createEvent: boolean;
  /** Any `create` value was present (valid or not) and should be cleared. */
  present: boolean;
}

export function readCalendarCreateIntent(search: string): CalendarCreateIntent {
  const values = new URLSearchParams(search).getAll(CALENDAR_CREATE_PARAM);
  return {
    createEvent: values.length === 1 && values[0] === CALENDAR_CREATE_EVENT,
    present: values.length > 0,
  };
}

/** `href` without any `create` parameter; other params and hash unchanged. */
export function withoutCalendarCreateIntent(href: string) {
  const url = new URL(href);
  url.searchParams.delete(CALENDAR_CREATE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
