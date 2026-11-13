import { useMemo, useState } from 'react';
import type { ActivitySnapshot } from '../../insights/activity';
import type { Insights } from '../../insights/model';
import { allMerged, buildPulse } from '../../insights/pulse-model';
import type { LazyHistory } from '../../insights/use-lazy-history';
import { DEFAULT_RANGE, type Range, RANGES } from '../../insights/series';
import { timeToLive } from '../../insights/production';
import type { Lang, Messages } from '../shared';
import { Breakdown } from './breakdown';
import { Delta } from './delta';
import { fill, formatDuration, formatNumber, shortDay } from './format';
import { PulseChart } from './pulse-chart';

const DAY_MS = 86_400_000;
/** Ranges the build's own window covers; longer ones need the history. */
const NEEDS_HISTORY = (range: Range) => range > 7;

/**
 * Shipping pulse: merged pull requests per day (all PRs where observed, and
 * the roadmap-tracked ones, with how many of those production runs now), a
 * 7-day average, period totals with their change, merge-to-production time
 * and a per-product breakdown, over 7, 14, 30 or 90 days.
 */
export function PulseSection({
  t,
  lang,
  insights,
  activity,
  lazy,
  today,
  now,
}: {
  t: Messages;
  lang: Lang;
  insights: Insights;
  activity: ActivitySnapshot;
  lazy: LazyHistory;
  today: string;
  now: number;
}) {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE);
  const pick = (next: Range) => {
    setRange(next);
    if (NEEDS_HISTORY(next)) lazy.load();
  };
  const all = useMemo(
    () => (lazy.history ? allMerged(activity, lazy.history) : insights.all),
    [activity, lazy.history, insights.all]
  );
  const historyState = lazy.state;
  const pulse = useMemo(
    () =>
      buildPulse({
        tracked: insights.tracked,
        all,
        deploys: activity.deploys,
        today,
        range,
      }),
    [insights.tracked, all, activity.deploys, today, range]
  );
  const ttl = useMemo(
    () => timeToLive(insights.builds, now - range * DAY_MS),
    [insights.builds, now, range]
  );
  const n = (value: number) => formatNumber(value, lang);
  const previousLabel = fill(t.pulse.vsPrevious, { n: range });
  const primaryChange =
    pulse.primary === 'all' ? pulse.allChange : pulse.trackedChange;

  return (
    <section
      className="section pulse-section"
      id="pulse"
      aria-labelledby="pulse-title"
      ref={lazy.nearRef}
    >
      <header className="section-head pulse-head">
        <div>
          <h2 id="pulse-title">{t.pulse.title}</h2>
          <p>{t.pulse.subtitle}</p>
        </div>
        <fieldset className="segmented range-switch">
          <legend className="sr-only">{t.pulse.range}</legend>
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              aria-label={fill(t.pulse.rangeName, { n: option })}
              onClick={() => pick(option)}
            >
              {fill(t.pulse.rangeOption, { n: option })}
            </button>
          ))}
        </fieldset>
      </header>
      <div className="pulse-layout">
        <figure className="pulse-card">
          <figcaption className="pulse-legend">
            <span className="key key-all">
              <i aria-hidden />
              {t.pulse.all}
            </span>
            <span className="key key-tracked">
              <i aria-hidden />
              {t.pulse.tracked}
            </span>
            <span className="key key-prod">
              <i aria-hidden />
              {t.pulse.inProd}
            </span>
            <span className="key key-ma">
              <i aria-hidden />
              {t.pulse.average}
            </span>
          </figcaption>
          <PulseChart points={pulse.points} t={t} lang={lang} today={today} />
          <div className="pulse-notes">
            <p>{t.pulse.allScope}</p>
            <p>{t.pulse.trackedScope}</p>
            {pulse.lastDay ? (
              <p>
                {fill(t.pulse.asOf, { date: shortDay(pulse.lastDay, lang) })}
              </p>
            ) : null}
            {/* Status last: when it changes, only what follows moves. */}
            {pulse.partial ? <p>{t.pulse.capped}</p> : null}
            {!pulse.allComplete ? <p>{t.pulse.allUnavailable}</p> : null}
            {historyState === 'loading' ? <p>{t.pulse.loading}</p> : null}
            {historyState === 'failed' && NEEDS_HISTORY(range) ? (
              <p>{t.pulse.failed}</p>
            ) : null}
          </div>
        </figure>
        <aside
          className="pulse-side"
          aria-label={fill(t.pulse.rangeName, { n: range })}
        >
          <dl className="pulse-totals">
            <div className="total-primary">
              <dt>{pulse.primary === 'all' ? t.pulse.all : t.pulse.tracked}</dt>
              <dd>
                <b>
                  {pulse.primary === 'all' && pulse.totals.all !== null
                    ? n(pulse.totals.all)
                    : n(pulse.totals.tracked)}
                </b>
                {primaryChange ? (
                  <Delta
                    value={primaryChange}
                    t={t}
                    lang={lang}
                    label={previousLabel}
                  />
                ) : null}
              </dd>
            </div>
            <div hidden={pulse.primary === 'tracked'}>
              <dt>{t.pulse.tracked}</dt>
              <dd>
                <b>{n(pulse.totals.tracked)}</b>
                <Delta
                  value={pulse.trackedChange}
                  t={t}
                  lang={lang}
                  label={previousLabel}
                />
              </dd>
            </div>
            <div>
              <dt>{t.pulse.inProd}</dt>
              <dd>
                <b>{n(pulse.totals.inProd)}</b>
                <span className="of">/ {n(pulse.totals.tracked)}</span>
              </dd>
            </div>
            <div>
              <dt>{t.pulse.ttl}</dt>
              <dd className="ttl">
                {ttl.medianMs !== null && ttl.p90Ms !== null ? (
                  <>
                    <span>
                      <small>{t.pulse.median}</small>
                      <b>{formatDuration(ttl.medianMs, t, lang)}</b>
                    </span>
                    <span>
                      <small>{t.pulse.p90}</small>
                      <b>{formatDuration(ttl.p90Ms, t, lang)}</b>
                    </span>
                  </>
                ) : (
                  <span className="na">{t.pulse.notAvailable}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>{t.pulse.waitingAge}</dt>
              <dd className="ttl">
                {insights.waitAge.medianMs !== null &&
                insights.waitAge.p90Ms !== null ? (
                  <>
                    <span>
                      <small>{t.pulse.median}</small>
                      <b>
                        {formatDuration(insights.waitAge.medianMs, t, lang)}
                      </b>
                    </span>
                    <span>
                      <small>{t.pulse.p90}</small>
                      <b>{formatDuration(insights.waitAge.p90Ms, t, lang)}</b>
                    </span>
                  </>
                ) : (
                  <span className="na">{t.pulse.none}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>{t.pulse.deploys}</dt>
              <dd>
                <b>{n(pulse.totals.deploys)}</b>
              </dd>
            </div>
          </dl>
          <p className="pulse-fine">
            {t.pulse.ttlNote} {t.pulse.deploysNote}
          </p>
        </aside>
        <div className="pulse-breakdown">
          <Breakdown
            t={t}
            lang={lang}
            products={pulse.products}
            scope={pulse.primary === 'all' ? t.pulse.all : t.pulse.tracked}
          />
        </div>
      </div>
    </section>
  );
}
