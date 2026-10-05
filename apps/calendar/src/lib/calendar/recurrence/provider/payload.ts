import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceRule,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import {
  CalendarRecurrenceAnchorSchema,
  toGoogleCalendarRecurrence,
  toGraphCalendarRecurrence,
  validateCalendarRecurrence,
} from '@tuturuuu/utils/calendar-recurrence';

export type ProviderSeriesContent = {
  title: string;
  description?: string;
  location?: string | null;
};
export type ProviderSeriesSnapshot = {
  rule: CalendarRecurrenceRule;
  anchor: CalendarRecurrenceAnchor;
  event: ProviderSeriesContent;
};

export function googleSeriesPayload(
  snapshot: ProviderSeriesSnapshot,
  occurrence = false
) {
  CalendarRecurrenceAnchorSchema.parse(snapshot.anchor);
  if (!occurrence) validateCalendarRecurrence(snapshot.rule, snapshot.anchor);
  const time = (value: string) =>
    snapshot.anchor.allDay
      ? { date: value.slice(0, 10) }
      : { dateTime: value, timeZone: snapshot.rule.timeZone };
  return {
    summary: snapshot.event.title,
    description: snapshot.event.description ?? '',
    location: snapshot.event.location ?? '',
    start: time(snapshot.anchor.startLocal),
    end: time(snapshot.anchor.endLocal),
    ...(occurrence
      ? {}
      : {
          recurrence: toGoogleCalendarRecurrence(
            snapshot.rule,
            snapshot.anchor
          ),
        }),
  };
}

export function graphSeriesPayload(
  snapshot: ProviderSeriesSnapshot,
  occurrence = false
) {
  CalendarRecurrenceAnchorSchema.parse(snapshot.anchor);
  if (!occurrence) validateCalendarRecurrence(snapshot.rule, snapshot.anchor);
  return {
    subject: snapshot.event.title,
    body: { contentType: 'text', content: snapshot.event.description ?? '' },
    location: { displayName: snapshot.event.location ?? '' },
    start: {
      dateTime: snapshot.anchor.startLocal,
      timeZone: snapshot.rule.timeZone,
    },
    end: {
      dateTime: snapshot.anchor.endLocal,
      timeZone: snapshot.rule.timeZone,
    },
    isAllDay: snapshot.anchor.allDay,
    ...(occurrence
      ? {}
      : {
          recurrence: toGraphCalendarRecurrence(snapshot.rule, snapshot.anchor),
        }),
  };
}
