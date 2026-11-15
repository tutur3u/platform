import { Sparkles } from '@tuturuuu/icons';
import { visibleComingSoon } from '../content/coming-soon';
import { type Status, statuses } from '../live/status';
import type { Insights } from '../insights/model';
import type { RoadmapView } from '../view-model';
import { InfoPopover, Tooltip } from './info';
import { KpiTiles } from './insights/kpis';
import { type Lang, type Messages, StatusBadge } from './shared';

export function Hero({
  t,
  view,
  lang,
  insights,
}: {
  t: Messages;
  view: RoadmapView;
  lang: Lang;
  insights: Insights;
}) {
  return (
    <section className="hero" aria-labelledby="page-title">
      <div className="hero-wash" aria-hidden />
      <p className="eyebrow">
        <span className="eyebrow-dot" aria-hidden />
        {t.eyebrow}
      </p>
      <h1 id="page-title">
        <span className="hero-h1-main">{t.title}</span>
        <span className="hero-h1-sub">
          <MarkedPhrase text={t.titleAccent} mark={t.titleMark} />
        </span>
      </h1>
      <p className="intro">{t.intro}</p>
      <KpiTiles t={t} lang={lang} view={view} insights={insights} />
      <OverallBar totals={view.totals} t={t} />
    </section>
  );
}

/** One phrase of `text` underlined in brand purple; the rest stays plain. */
export function MarkedPhrase({ text, mark }: { text: string; mark: string }) {
  const at = mark ? text.indexOf(mark) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="hero-mark">{mark}</span>
      {text.slice(at + mark.length)}
    </>
  );
}

export function OverallBar({
  totals,
  t,
}: {
  totals: Record<Status, number>;
  t: Messages;
}) {
  const total = statuses.reduce((sum, s) => sum + totals[s], 0) || 1;
  return (
    <div className="overall">
      <div className="bar" aria-hidden>
        {statuses.map((s) =>
          totals[s] ? (
            <span
              key={s}
              className={`seg ${s}`}
              style={{ width: `${(totals[s] / total) * 100}%` }}
            />
          ) : null
        )}
      </div>
      <div className="legend-row">
        <ul className="legend">
          {statuses.map((s) => (
            <li key={s}>
              <Tooltip id={`tip-status-${s}`} tip={t.method[s]}>
                <span className={`dot ${s}`} aria-hidden />
                <span className="tip-label">{t.status[s]}</span>{' '}
                <b>{totals[s]}</b>
              </Tooltip>
            </li>
          ))}
        </ul>
        <StatusMethod t={t} />
      </div>
    </div>
  );
}

/**
 * How statuses are computed: every definition and the sources, behind the
 * (i) button beside the status legend.
 */
export function StatusMethod({ t }: { t: Messages }) {
  return (
    <InfoPopover
      id="status-method"
      label={t.method.title}
      closeLabel={t.info.close}
    >
      <dl className="method-list">
        {statuses.map((s) => (
          <div key={s}>
            <dt>
              <StatusBadge status={s} t={t} />
            </dt>
            <dd>{t.method[s]}</dd>
          </div>
        ))}
      </dl>
      <p className="info-fine">{t.method.sources}</p>
    </InfoPopover>
  );
}

export function ComingSoon({ t, lang }: { t: Messages; lang: Lang }) {
  const items = visibleComingSoon();
  if (!items.length) return null;
  return (
    <section className="coming-soon" aria-labelledby="coming-soon-title">
      {items.map((item) => (
        <article key={item.id}>
          <span className="chip glow">
            <Sparkles size={14} aria-hidden /> {t.comingSoon}
          </span>
          <h2 id="coming-soon-title">{item.title[lang]}</h2>
          <p>{item.body[lang]}</p>
        </article>
      ))}
    </section>
  );
}
