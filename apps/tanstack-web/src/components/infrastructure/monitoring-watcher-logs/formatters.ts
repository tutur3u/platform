'use client';

function parseTime(value: number | string | null | undefined) {
  if (value == null) {
    return Number.NaN;
  }

  return typeof value === 'number' ? value : Date.parse(value);
}

export function formatCompactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    notation: 'compact',
  }).format(value);
}

export function formatClockTime(value: number | string | null | undefined) {
  const time = parseTime(value);

  if (!Number.isFinite(time)) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}

export function formatDateTime(value: number | string | null | undefined) {
  const time = parseTime(value);

  if (!Number.isFinite(time)) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(time);
}

export function formatRelativeTime(value: number | string | null | undefined) {
  const time = parseTime(value);

  if (!Number.isFinite(time)) {
    return '-';
  }

  const diff = time - Date.now();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];

  for (const [unit, size] of units) {
    if (abs >= size || unit === 'second') {
      return new Intl.RelativeTimeFormat(undefined, {
        numeric: 'auto',
      }).format(Math.round(diff / size), unit);
    }
  }

  return '-';
}
