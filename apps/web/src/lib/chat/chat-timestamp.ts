/** Canonicalize only validated SQL/ISO receipt timestamps; retain SQL microseconds. */
export function normalizeChatTimestamp(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Invalid chat receipt timestamp');
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
      value
    );
  if (!match) throw new Error('Invalid chat receipt timestamp');
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  if (!year || !month || !day || !hour || !minute || !second || !zone)
    throw new Error('Invalid chat receipt timestamp');
  const y = Number(year),
    m = Number(month),
    d = Number(day);
  const h = Number(hour),
    min = Number(minute),
    sec = Number(second);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    y < 1 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > (days[m - 1] ?? 0) ||
    h > 23 ||
    min > 59 ||
    sec > 59
  ) {
    throw new Error('Invalid chat receipt timestamp');
  }
  let offset = 0;
  if (zone !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    const hours = Number(digits.slice(0, 2));
    const minutes = Number(digits.slice(2) || '0');
    if (hours > 23 || minutes > 59)
      throw new Error('Invalid chat receipt timestamp');
    offset = (hours * 60 + minutes) * (zone[0] === '+' ? 1 : -1);
  }
  // Calendar validation precedes Date arithmetic; fractions never pass through milliseconds.
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  date.setUTCHours(h, min - offset, sec, 0);
  const iso = date.toISOString();
  if (!/^\d{4}-/.test(iso) || iso.startsWith('0000-'))
    throw new Error('Invalid chat receipt timestamp');
  return `${iso.slice(0, 19)}.${fraction ?? '000'}Z`;
}

export function normalizeChatMessageTimestamp<T extends { createdAt: string }>(
  message: T
): T {
  return { ...message, createdAt: normalizeChatTimestamp(message.createdAt) };
}
