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
