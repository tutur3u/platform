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

/**
 * A weekly flow: how many items entered a state this week, shown as a count
 * ("+11 this week"), never as a percentage of the running total. `tone`
 * says whether more is welcome; a queue filling up is neutral, its wait
 * time is the signal.
 */
export function Flow({
  value,
  t,
  lang,
  tone,
}: {
  value: Change;
  t: Messages;
  lang: Lang;
  tone: 'good' | 'neutral';
}) {
  const n = formatNumber(value.current, lang);
  const words = fill(t.stats.flowWords, {
    n,
    previous: formatNumber(value.previous, lang),
  });
  return (
    <span
      className={`delta delta-flow delta-${value.current > 0 ? tone : 'flat'}`}
    >
      <span aria-hidden>{value.current > 0 ? `+${n}` : n}</span>
      <span className="delta-label" aria-hidden>
        {t.stats.thisWeek}
      </span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

export function plural(template: string, n: number, lang: Lang) {
  return fill(template, { n: formatNumber(n, lang) });
}
