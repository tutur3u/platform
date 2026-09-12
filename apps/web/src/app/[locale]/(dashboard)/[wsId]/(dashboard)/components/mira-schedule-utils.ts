import type { ArtifactRow } from './mira-artifact-data';

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Split overlapping events into visible local days, using exclusive end boundaries. */
export function calendarDayRows(rows: ArtifactRow[], days: Date[]) {
  return days.flatMap((day) => {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return rows.flatMap((row) => {
      if (!row.date) return [];
      const start = new Date(row.date).getTime();
      const end = row.endDate ? new Date(row.endDate).getTime() : start + 1;
      if (!(start < next.getTime() && end > day.getTime())) return [];
      return [
        {
          ...row,
          allDay: start <= day.getTime() && end >= next.getTime(),
          date: new Date(Math.max(start, day.getTime())).toISOString(),
          endDate: new Date(Math.min(end, next.getTime())).toISOString(),
        },
      ];
    });
  });
}
