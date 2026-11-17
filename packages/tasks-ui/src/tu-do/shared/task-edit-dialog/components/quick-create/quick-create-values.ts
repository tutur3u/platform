import dayjs from 'dayjs';

/** The quick-create property chips, in Tab order. */
export const QUICK_CREATE_CHIP_IDS = [
  'list',
  'priority',
  'start',
  'due',
  'estimate',
  'labels',
  'project',
  'assignees',
] as const;

export type QuickCreateChipId = (typeof QUICK_CREATE_CHIP_IDS)[number];

/**
 * A chip value such as "Fri, Nov 20" in the reader's locale and, when set,
 * the calendar timezone preference the date picker also uses.
 */
export function formatQuickCreateDate(
  date: Date,
  locale: string,
  timeZone?: string
) {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };

  for (const candidate of [
    { locale, timeZone },
    { locale, timeZone: undefined },
    { locale: 'en-US', timeZone: undefined },
  ]) {
    try {
      return new Intl.DateTimeFormat(candidate.locale, {
        ...options,
        timeZone: candidate.timeZone,
      }).format(date);
    } catch {
      // Unknown locale or timezone: try the next, more general format.
    }
  }

  return date.toDateString();
}

/** A due date picked without a time means the end of that day. */
export function normalizeQuickCreateDueDate(date: Date) {
  const picked = dayjs(date);
  const isMidnight =
    picked.hour() === 0 &&
    picked.minute() === 0 &&
    picked.second() === 0 &&
    picked.millisecond() === 0;

  return isMidnight ? picked.endOf('day').toDate() : date;
}

/** Days from today to the last day of this week, honoring the week start. */
export function getDaysUntilEndOfWeek(weekStartsOn: number | undefined) {
  const endOfWeekDay = ((weekStartsOn ?? 0) - 1 + 7) % 7;
  return (endOfWeekDay - dayjs().day() + 7) % 7;
}

/** Case-insensitive substring filter used by every quick-create picker. */
export function filterQuickCreateOptions<T>(
  items: readonly T[],
  query: string,
  getText: (item: T) => string
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...items];

  return items.filter((item) =>
    getText(item).toLocaleLowerCase().includes(normalizedQuery)
  );
}
