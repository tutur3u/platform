/** Locale-aware labels for fleet times and products. Pure; `now` is injectable for tests. */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "12 min ago", "5 hr ago", "2 days ago" in the viewer's language; null when unknown. */
export function formatFleetAge(
  iso: string | null,
  locale: string,
  now: number = Date.now()
): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const age = Math.max(0, now - t);
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: 'always',
    style: 'short',
  });
  if (age < HOUR)
    return rtf.format(-Math.max(1, Math.round(age / MINUTE)), 'minute');
  if (age < DAY) return rtf.format(-Math.round(age / HOUR), 'hour');
  return rtf.format(-Math.round(age / DAY), 'day');
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today 15:00", "Tomorrow 10:00", "Mon 10:00" or a short date; 24-hour time. */
export function formatFleetEta(
  iso: string | null,
  locale: string,
  now: number = Date.now()
): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(t);
  const days = Math.round((startOfDay(t) - startOfDay(now)) / DAY);
  if (days >= -1 && days <= 1) {
    const word = new Intl.RelativeTimeFormat(locale, {
      numeric: 'auto',
    }).format(days, 'day');
    return `${word.charAt(0).toLocaleUpperCase(locale)}${word.slice(1)} ${time}`;
  }
  if (days > 1 && days < 7) {
    return `${new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(t)} ${time}`;
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(t);
}

const PRODUCT_DOT: Record<string, string> = {
  tasks: 'bg-dynamic-green',
  meet: 'bg-dynamic-purple',
  mail: 'bg-dynamic-blue',
  calendar: 'bg-dynamic-blue',
  chat: 'bg-dynamic-pink',
  finance: 'bg-dynamic-orange',
  upskii: 'bg-dynamic-yellow',
  mobile: 'bg-dynamic-cyan',
  mira: 'bg-dynamic-blue',
};
const PRODUCT_NAME: Record<string, string> = {
  pktm: 'PKTM',
  ai: 'AI',
  ci: 'CI',
};

export function getFleetProduct(
  slug: string | null
): { label: string; dotClassName?: string } | null {
  if (!slug) return null;
  const key = slug.toLowerCase();
  const label =
    PRODUCT_NAME[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, ' ');
  return { label, dotClassName: PRODUCT_DOT[key] };
}
