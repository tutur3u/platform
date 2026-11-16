import type { Change } from '../../insights/series';
import type { Lang, Messages } from '../shared';

/** Fill `{name}` placeholders in a message. */
export function fill(
  template: string,
  values: Record<string, string | number>
) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

const locale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'vi-VN');

/** "13 Nov" for a Vietnam calendar day. */
export function shortDay(day: string, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** "Thursday, 13 Nov" for a Vietnam calendar day. */
export function longDay(day: string, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

export function formatNumber(value: number, lang: Lang, digits = 0) {
  return new Intl.NumberFormat(locale(lang), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

/** A duration in the largest sensible unit: minutes, hours or days. */
export function formatDuration(ms: number, t: Messages, lang: Lang) {
  const minutes = ms / 60_000;
  if (minutes < 90)
    return fill(t.pulse.minutes, {
      n: formatNumber(Math.max(1, minutes), lang),
    });
  const hours = minutes / 60;
  if (hours < 48)
    return fill(t.pulse.hours, {
      n: formatNumber(hours, lang, hours < 10 ? 1 : 0),
    });
  const days = hours / 24;
  return fill(t.pulse.days, { n: formatNumber(days, lang, days < 10 ? 1 : 0) });
}

/**
 * A percentage only means something on a real base: below this many items
 * last week, or past this ratio, the change is shown as a count instead
 * ("+11", not "+1,100%").
 */
export const PCT_MIN_BASE = 10;
export const PCT_MAX_RATIO = 3;

/** Whether `value` reads as a percentage (else as a signed count). */
export function deltaAsPercent(value: Change) {
  return (
    value.pct !== null &&
    value.previous >= PCT_MIN_BASE &&
    Math.abs(value.pct) <= PCT_MAX_RATIO
  );
}

/** "+12%" / "−8%" / "+5" (small or no base, or an outsized ratio) / "0". */
export function deltaText(value: Change, lang: Lang) {
  if (value.direction === 'flat') return '0';
  const sign = value.delta > 0 ? '+' : '−';
  if (value.pct === null || !deltaAsPercent(value))
    return `${sign}${formatNumber(Math.abs(value.delta), lang)}`;
  return `${sign}${formatNumber(Math.abs(value.pct) * 100, lang)}%`;
}
