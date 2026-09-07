import dayjs from 'dayjs';

/** Endpoints are inclusive days; the event query expands the final day. */
export function calendarPeriodDates(
  date: Date,
  view: 'year' | 'agenda'
): Date[] {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  if (view === 'year') start.setMonth(0, 1);
  const end = new Date(start);
  if (view === 'year') end.setMonth(11, 31);
  else end.setDate(end.getDate() + 29);
  return [start, end];
}

/** Create at 9 AM on the selected calendar day, in its configured zone. */
export function calendarDraftDate(date: Date, zone?: string): Date {
  const wallTime = `${dayjs(date).format('YYYY-MM-DD')}T09:00:00`;
  return (
    zone && zone !== 'auto' ? dayjs.tz(wallTime, zone) : dayjs(wallTime)
  ).toDate();
}
