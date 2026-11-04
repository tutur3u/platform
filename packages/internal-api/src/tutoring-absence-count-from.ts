const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function isoDay(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * The latest accepted count-from date: tomorrow in UTC, which is at or after
 * today in every workspace timezone.
 */
export function getTutoringAbsenceCountFromMax(now = Date.now()) {
  return isoDay(now + DAY_MS);
}

/**
 * A real calendar date no later than tomorrow in UTC; null and absent both
 * clear it.
 */
export function parseAbsenceCountFromDate(value: unknown, now: Date) {
  if (value === undefined || value === null) return { date: null };
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || isoDay(time) !== value) return null;
  if (value > getTutoringAbsenceCountFromMax(now.getTime())) return null;
  return { date: value };
}

/**
 * The earliest absence date that feeds make-up suggestions: the later of the
 * rolling lookback and the chosen count-from date.
 */
export function getTutoringAbsenceCutoff(
  policy: { absenceLookbackDays: number; absenceCountFromDate: string | null },
  now = Date.now()
) {
  const rolling = isoDay(now - policy.absenceLookbackDays * DAY_MS);
  const from = policy.absenceCountFromDate;
  return from && from > rolling ? from : rolling;
}
