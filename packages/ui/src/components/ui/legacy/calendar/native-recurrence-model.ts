import type {
  CreateNativeCalendarSeriesPayload,
  MutateNativeCalendarSeriesPayload,
  NativeCalendarSeries,
} from '@tuturuuu/internal-api/calendar-series';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type {
  CalendarRecurrenceRule,
  CalendarWeekday,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import {
  CalendarRecurrenceAnchorSchema,
  inspectCalendarRecurrenceSlot,
  validateCalendarRecurrence,
} from '@tuturuuu/utils/calendar-recurrence';
import {
  recurrenceInitialTimes,
  recurrenceInstantLocal,
  recurrenceLocalAnchor,
  recurrenceLocalParts,
  recurrenceMidnightRange,
} from '@tuturuuu/utils/calendar-recurrence-local';
export type RecurrenceScope = 'this' | 'all' | 'future';
export interface RecurrenceDraft {
  title: string;
  description: string;
  location: string;
  startLocal: string;
  endLocal: string;
  timeZone: string;
  allDay: boolean;
  frequency: CalendarRecurrenceRule['frequency'];
  interval: string;
  weekdays: CalendarWeekday[];
  retainedRule?: CalendarRecurrenceRule;
  monthDay: string;
  endType: CalendarRecurrenceRule['end']['type'];
  endValue: string;
}
const weekdays: CalendarWeekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export function newRecurrenceDraft(
  timeZone: string,
  now = new Date()
): RecurrenceDraft {
  const start = recurrenceInitialTimes(timeZone, now);
  return {
    title: '',
    description: '',
    location: '',
    startLocal: start.startLocal,
    endLocal: start.endLocal,
    timeZone,
    allDay: false,
    frequency: 'weekly',
    interval: '1',
    weekdays: [weekdays[start.dayOfWeek - 1]!],
    monthDay: String(start.day),
    endType: 'never',
    endValue: '',
  };
}
export function recurrenceEditDraft(
  series: NativeCalendarSeries,
  event: CalendarEvent,
  scope: RecurrenceScope
): RecurrenceDraft {
  if (!event.originalStartLocal || event.seriesId !== series.id)
    throw new Error('Invalid recurrence identity');
  const rule =
    scope === 'future'
      ? inspectCalendarRecurrenceSlot({
          rule: series.rule,
          anchor: series.anchor,
          originalStartLocal: event.originalStartLocal,
        }).remainingRule
      : series.rule;
  const local = (instant: string) =>
    recurrenceInstantLocal(instant, rule.timeZone);
  const anchor =
    scope === 'all'
      ? series.anchor
      : {
          startLocal: local(event.start_at),
          endLocal: local(event.end_at),
          allDay: series.anchor.allDay,
        };
  const payload = scope === 'all' ? series.payload : event;
  return {
    retainedRule: rule.weekIndex ? rule : undefined,
    title: payload.title ?? '',
    description: payload.description ?? '',
    location: payload.location ?? '',
    startLocal: anchor.startLocal.slice(0, 16),
    endLocal: anchor.endLocal.slice(0, 16),
    timeZone: rule.timeZone,
    allDay: anchor.allDay,
    frequency: rule.frequency,
    interval: String(rule.interval),
    weekdays: rule.weekdays ?? [],
    monthDay: String(
      rule.monthDay ?? recurrenceLocalParts(anchor.startLocal).day
    ),
    endType: rule.end.type,
    endValue:
      rule.end.type === 'count'
        ? String(rule.end.count)
        : rule.end.type === 'until'
          ? rule.end.date
          : '',
  };
}
export function recurrenceDraftPayload(
  draft: RecurrenceDraft,
  occurrenceOnly = false
) {
  if (!draft.title.trim() || draft.title.length > 1000)
    throw new Error('Invalid title');
  const start = recurrenceLocalParts(draft.startLocal);
  const rule: CalendarRecurrenceRule = {
    version: 1,
    frequency: draft.frequency,
    interval: Number(draft.interval),
    timeZone: draft.timeZone,
    end:
      draft.endType === 'count'
        ? { type: 'count', count: Number(draft.endValue) }
        : draft.endType === 'until'
          ? { type: 'until', date: draft.endValue }
          : { type: 'never' },
  };
  if (rule.frequency === 'weekly') rule.weekdays = draft.weekdays;
  if (rule.frequency === 'monthly' || rule.frequency === 'yearly') {
    rule.monthDay = Number(draft.monthDay);
    rule.monthDayOverflow = 'skip';
  }
  if (rule.frequency === 'yearly') rule.month = start.month;
  const anchor = recurrenceLocalAnchor(
    draft.startLocal,
    draft.endLocal,
    draft.allDay
  );
  if (occurrenceOnly) CalendarRecurrenceAnchorSchema.parse(anchor);
  else validateCalendarRecurrence(draft.retainedRule ?? rule, anchor);
  return {
    rule: draft.retainedRule ?? rule,
    anchor,
    event: {
      title: draft.title.trim(),
      description: draft.description,
      location: draft.location || null,
    },
  };
}
export function recurrenceMutation(
  draft: RecurrenceDraft,
  series: NativeCalendarSeries,
  occurrence: CalendarEvent,
  scope: RecurrenceScope,
  requestId: string,
  action: 'update' | 'delete'
): MutateNativeCalendarSeriesPayload {
  if (occurrence.seriesId !== series.id || !occurrence.originalStartLocal)
    throw new Error('Invalid recurrence identity');
  const identity = {
    requestId,
    expectedRevision: series.revision,
    scope,
    originalStartLocal: occurrence.originalStartLocal,
  };
  if (action === 'delete') return identity;
  const payload = recurrenceDraftPayload(draft, scope === 'this');
  return {
    ...identity,
    event: payload.event,
    anchor: payload.anchor,
    ...(scope === 'this' ? {} : { rule: payload.rule }),
  };
}
/** A retry of unchanged intent reuses its key; any actor/workspace/revision or draft change does not. */
export function recurrenceRequestIdentity(
  newId: () => string = () => crypto.randomUUID()
) {
  let intent: string | undefined, id: string | undefined;
  return (
    scope: string,
    payload:
      | Omit<CreateNativeCalendarSeriesPayload, 'requestId'>
      | Omit<MutateNativeCalendarSeriesPayload, 'requestId'>,
    action: string
  ) => {
    const next = JSON.stringify([scope, action, payload]);
    if (next !== intent) {
      intent = next;
      id = newId();
    }
    return id!;
  };
}

export function recurrenceAllDay(
  draft: RecurrenceDraft,
  allDay: boolean
): RecurrenceDraft {
  if (!allDay) return { ...draft, allDay };
  return {
    ...draft,
    allDay,
    ...recurrenceMidnightRange(draft.startLocal, draft.endLocal),
  };
}
