/** Convert reviewed wall time to an instant; reject DST gaps and repeated hours. */
export function localTimeToIso(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('invalid_time');
  const nominal = Date.parse(`${value}:00Z`);
  if (
    !Number.isFinite(nominal) ||
    new Date(nominal).toISOString().slice(0, 16) !== value
  )
    throw new Error('invalid_time');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const local = (instant: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((p) => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = nominal + hours * 3_600_000;
    offsets.add(Date.parse(`${local(sample)}:00Z`) - sample);
  }
  const matches = [...offsets]
    .map((offset) => nominal - offset)
    .filter((instant) => local(instant) === value);
  if (matches.length !== 1)
    throw new Error(matches.length ? 'ambiguous_time' : 'invalid_time');
  return new Date(matches[0]!).toISOString();
}

export function instantToLocal(value: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function suggestedLocalTime(
  value: string | null,
  sourceTimezone: string | null,
  timezone: string
) {
  if (!value || !sourceTimezone) return '';
  try {
    return instantToLocal(localTimeToIso(value, sourceTimezone), timezone);
  } catch {
    return '';
  }
}
