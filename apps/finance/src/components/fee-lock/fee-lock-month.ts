const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Current `YYYY-MM` in the fee-lock period zone (design §2.0). */
export function currentFeeLockMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}`;
}

export function normalizeFeeLockMonth(value: unknown, now?: Date) {
  return typeof value === 'string' && MONTH_PATTERN.test(value)
    ? value
    : currentFeeLockMonth(now);
}

export function shiftFeeLockMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (monthIndex ?? 1) - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}

/** `MM/YYYY`, the format staff use in notices. */
export function formatFeeLockMonth(month: string) {
  const [year, monthPart] = month.split('-');
  return `${monthPart}/${year}`;
}
