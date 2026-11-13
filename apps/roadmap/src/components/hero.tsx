import { Sparkles } from '@tuturuuu/icons';
import { visibleComingSoon } from '../content/coming-soon';
import { type Status, statuses } from '../live/status';
import type { LiveData } from '../live/model';
import type { RoadmapView } from '../view-model';
import { ShippingPulse } from './pulse';
import type { Lang, Messages } from './shared';

export function Hero({
  t,
  view,
  lang,
  data,
  now,
}: {
  t: Messages;
  view: RoadmapView;
  lang: Lang;
  data: LiveData;
  now: number;
}) {
  const stats = [
    {
      label: t.stats.shippedWeek,
      value: String(view.recent.length),
      tone: 'live',
    },
    {
      label: t.stats.live,
      value: `${view.totals.live}`,
      sub: `/ ${view.total}`,
      tone: 'live',
    },
    {
      label: t.stats.inFlight,
      value: String(view.totals.in_progress + view.totals.waiting_for_merge),
      tone: 'in_progress',
    },
    {
      label: t.stats.cloudflare,
      // Never a number this build did not observe.
      value: view.hostingVerified ? String(view.onWorkers) : '—',
      sub: view.hostingVerified ? `/ ${view.hosts.length}` : t.hosting.unknown,
      tone: 'waiting_for_prod_sync',
    },
  ];
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
      <dl className="stats">
        {stats.map((stat) => (
          <div className={`stat tone-${stat.tone}`} key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>
              {stat.value}
              {stat.sub ? <span>{stat.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="hero-viz">
        <OverallBar totals={view.totals} t={t} />
        <ShippingPulse t={t} lang={lang} data={data} now={now} />
      </div>
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
      <ul className="legend">
        {statuses.map((s) => (
          <li key={s}>
            <span className={`dot ${s}`} aria-hidden />
            {t.status[s]} <b>{totals[s]}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComingSoon({ t }: { t: Messages }) {
  const items = visibleComingSoon();
  if (!items.length) return null;
  return (
    <section className="coming-soon" aria-labelledby="coming-soon-title">
      {items.map((item) => (
        <article key={item.id}>
          <span className="chip glow">
            <Sparkles size={14} aria-hidden /> {t.comingSoon}
          </span>
          <h2 id="coming-soon-title">{item.title}</h2>
          <p>{item.body}</p>
        </article>
      ))}
    </section>
  );
}
