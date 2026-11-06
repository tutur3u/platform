const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
];

/** "3 min ago" style age in the viewer's locale; null when unknown. */
export function formatAge(ms: number | null, locale: string) {
  if (ms === null || !Number.isFinite(ms)) return null;
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: 'short',
  });
  for (const [unit, size] of UNITS) {
    if (ms >= size || unit === 'second') {
      return formatter.format(-Math.floor(ms / size), unit);
    }
  }
  return null;
}

export function ageSince(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : Math.max(now.getTime() - time, 0);
}

/** Server-rendered timestamps are shown in UTC so they never imply a zone. */
export function formatUtcTime(value: Date | string, locale: string) {
  return `${new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

/** HH:mm:ss in UTC, for dense log timestamps under a UTC-labelled header. */
export function formatUtcClock(value: Date | string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function formatGiB(bytes: number | null) {
  if (bytes === null) return null;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

export function formatDurationSeconds(seconds: number | null) {
  if (seconds === null) return null;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds)}s`;
}
