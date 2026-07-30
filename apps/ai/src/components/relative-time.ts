const RELATIVE_UNITS = [
  { milliseconds: 31_536_000_000, unit: 'year' },
  { milliseconds: 2_629_800_000, unit: 'month' },
  { milliseconds: 604_800_000, unit: 'week' },
  { milliseconds: 86_400_000, unit: 'day' },
  { milliseconds: 3_600_000, unit: 'hour' },
  { milliseconds: 60_000, unit: 'minute' },
  { milliseconds: 1_000, unit: 'second' },
] as const satisfies ReadonlyArray<{
  milliseconds: number;
  unit: Intl.RelativeTimeFormatUnit;
}>;

export interface FormattedRelativeTimestamp {
  exact: string;
  iso: string;
  relative: string;
}

export function formatRelativeTimestamp(
  value: string | null | undefined,
  locale: string,
  now = new Date()
): FormattedRelativeTimestamp | null {
  if (!value) return null;

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;

  const difference = timestamp.getTime() - now.getTime();
  const absoluteDifference = Math.abs(difference);
  const selectedUnit =
    RELATIVE_UNITS.find(
      ({ milliseconds }) => absoluteDifference >= milliseconds
    ) ?? RELATIVE_UNITS.at(-1);

  if (!selectedUnit) return null;

  const amount =
    absoluteDifference < 1_000
      ? 0
      : Math.round(difference / selectedUnit.milliseconds);

  return {
    exact: new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'long',
    }).format(timestamp),
    iso: timestamp.toISOString(),
    relative: new Intl.RelativeTimeFormat(locale, {
      numeric: 'auto',
      style: 'long',
    }).format(amount, selectedUnit.unit),
  };
}
