import { useMemo } from 'react';
import { buildCommitPulse } from '../../insights/commit-pulse';
import type { CommitWindow } from '../../insights/commits';
import type { Range } from '../../insights/series';
import type { Lang, Messages } from '../shared';
import { Breakdown } from './breakdown';
import { Delta } from './delta';
import { fill, formatDuration, formatNumber, shortDay } from './format';
import { PulseChart } from './pulse-chart';

/**
 * The shipping pulse counted in commits to main: per day, what production
 * runs now under what still waits on main, a 7-day average, range totals
 * with their change, the direct-to-main share, the production branch's lag
 * and a per-product breakdown.
 */
export function CommitPulse({
  t,
  lang,
  commits,
  range,
  today,
  now,
}: {
  t: Messages;
  lang: Lang;
  commits: CommitWindow;
  range: Range;
  today: string;
  now: number;
}) {
  const pulse = useMemo(
    () => buildCommitPulse({ commits, today, range }),
    [commits, today, range]
  );
  const n = (value: number) => formatNumber(value, lang);
  const { total, viaPr, inProd } = pulse.totals;
  const share = total
    ? new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format((total - viaPr) / total)
    : '—';
  const production = commits.production;
  const oldest = production?.oldestWaitingAt
    ? Math.max(0, now - Date.parse(production.oldestWaitingAt))
    : null;
  return (
    <div className="pulse-layout">
      <figure className="pulse-card">
        <PulseChart
          points={pulse.points}
          t={t}
          lang={lang}
          today={today}
          flow="commits"
        />
        {pulse.asOf !== today || !pulse.complete ? (
          <div className="pulse-notes">
            {pulse.asOf !== today ? (
              <p>
                {fill(t.commits.asOf, { date: shortDay(pulse.asOf, lang) })}
              </p>
            ) : null}
            {pulse.complete ? null : <p>{t.commits.unavailable}</p>}
          </div>
        ) : null}
      </figure>
      <aside
        className="pulse-side"
        aria-label={fill(t.pulse.rangeName, { n: range })}
      >
        <dl className="pulse-totals">
          <div className="total-primary">
            <dt>{t.commits.commits}</dt>
            <dd>
              <b>{n(total)}</b>
              {pulse.totalChange ? (
                <Delta
                  value={pulse.totalChange}
                  t={t}
                  lang={lang}
                  label={fill(t.pulse.vsPrevious, { n: range })}
                />
              ) : null}
            </dd>
          </div>
          <div>
            <dt>{t.commits.direct}</dt>
            <dd>
              <b>{share}</b>
            </dd>
          </div>
          <div>
            <dt>{t.commits.inProd}</dt>
            <dd>
              <b>{n(inProd)}</b>
              <span className="of">/ {n(total)}</span>
            </dd>
          </div>
          <div>
            <dt>{t.commits.waitingNow}</dt>
            <dd>
              {production ? (
                <>
                  <b>{n(production.waiting)}</b>
                  {oldest !== null ? (
                    <span className="of">
                      {' '}
                      {fill(t.commits.oldest, {
                        age: formatDuration(oldest, t, lang),
                      })}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="na">{t.pulse.notAvailable}</span>
              )}
            </dd>
          </div>
        </dl>
      </aside>
      <div className="pulse-breakdown">
        <Breakdown
          t={t}
          lang={lang}
          products={pulse.products}
          scope={t.commits.commits}
        />
      </div>
    </div>
  );
}
