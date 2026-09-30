import { pickerTimeValue } from '../../date-time-picker-values';

/** Bounds stay instants; their clock labels use the calendar's resolved zone. */
export function eventEndPickerBounds(
  startAt: string,
  zone: string | undefined,
  allDay: boolean
) {
  const start = new Date(startAt);
  return {
    minDate: start,
    minTime: allDay
      ? undefined
      : pickerTimeValue(start, zone && zone !== 'auto' ? zone : null),
  };
}
