import type { MeetFinalizedTimeframe } from '@tuturuuu/types/primitives/MeetTogetherPlan';

function escapeIcs(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');
}

function toIcsTimestamp(value: string) {
  return new Date(value)
    .toISOString()
    .replaceAll(/[-:]/gu, '')
    .replace('.000', '');
}

export function createMeetIcs({
  planId,
  title,
  description,
  timeframes,
}: {
  planId: string;
  title: string;
  description?: string | null;
  timeframes: MeetFinalizedTimeframe[];
}) {
  const generatedAt = toIcsTimestamp(new Date().toISOString());
  const events = timeframes.flatMap((timeframe) => [
    'BEGIN:VEVENT',
    `UID:${timeframe.id}@meet.tuturuuu.com`,
    `DTSTAMP:${generatedAt}`,
    `DTSTART:${toIcsTimestamp(timeframe.start_at)}`,
    `DTEND:${toIcsTimestamp(timeframe.end_at)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description ?? `Tuturuuu Meet plan ${planId}`)}`,
    'END:VEVENT',
  ]);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tuturuuu//Meet//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
