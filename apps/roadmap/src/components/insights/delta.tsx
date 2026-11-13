import type { Change } from '../../insights/series';
import type { Lang, Messages } from '../shared';
import { deltaText, fill, formatNumber } from './format';

/**
 * A period-over-period change: a trend icon (CSS mask), a signed figure and words, so
 * the direction never depends on colour. `good` says which direction is
 * welcome (more merged work is good; a longer prod-sync queue is not).
 */
export function Delta({
  value,
  t,
  lang,
  good = 'up',
  label,
}: {
  value: Change;
  t: Messages;
  lang: Lang;
  good?: 'up' | 'down';
  label?: string;
}) {
  const tone =
    value.direction === 'flat'
      ? 'flat'
      : value.direction === good
        ? 'good'
        : 'bad';
  const words = `${t.stats[value.direction]} ${deltaText(value, lang)} ${
    label ?? t.stats.vsLastWeek
  } (${formatNumber(value.previous, lang)} → ${formatNumber(value.current, lang)})`;
  return (
    <span className={`delta delta-${value.direction} delta-${tone}`}>
      <span aria-hidden>
        {deltaText(value, lang)}
        {value.pct === null && value.direction !== 'flat'
          ? ` ${t.stats.fromZero}`
          : ''}
      </span>
      <span className="delta-label" aria-hidden>
        {label ?? t.stats.vsLastWeek}
      </span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

export function plural(template: string, n: number, lang: Lang) {
  return fill(template, { n: formatNumber(n, lang) });
}
