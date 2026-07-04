'use client';

export const SESSION_EDITOR_DAYS = [
  { labelKey: 'days_of_week.sunday', value: 0 },
  { labelKey: 'days_of_week.monday', value: 1 },
  { labelKey: 'days_of_week.tuesday', value: 2 },
  { labelKey: 'days_of_week.wednesday', value: 3 },
  { labelKey: 'days_of_week.thursday', value: 4 },
  { labelKey: 'days_of_week.friday', value: 5 },
  { labelKey: 'days_of_week.saturday', value: 6 },
] as const;

export function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
