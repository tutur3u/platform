import { Sparkles } from '@tuturuuu/icons';
import { comingSoon } from '../content/coming-soon';
import { type Status, statuses } from '../live/status';
import type { useLiveData } from '../live/use-live-data';
import type { RoadmapView } from '../view-model';
import { FreshnessPill } from './chrome';
import type { Lang, Messages } from './shared';

export function Hero({
  t,
  lang,
  live,
  view,
}: {
  t: Messages;
  lang: Lang;
  live: ReturnType<typeof useLiveData>;
  view: RoadmapView;
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
      value: String(view.onWorkers),
      sub: `/ ${view.hosts.length}`,
      tone: 'waiting_for_prod_sync',
    },
  ];
  return (
    <section className="hero" aria-labelledby="page-title">
      <p className="eyebrow">{t.eyebrow}</p>
      <h1 id="page-title">{t.title}</h1>
      <p className="intro">{t.intro}</p>
      <FreshnessPill
        t={t}
        lang={lang}
        state={live.state}
        generatedAt={live.data.generatedAt}
        now={live.now}
        mounted={live.mounted}
        onRefresh={() => void live.refresh()}
      />
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
      <OverallBar totals={view.totals} t={t} />
    </section>
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
  return (
    <section className="coming-soon" aria-labelledby="coming-soon-title">
      {comingSoon.map((item) => (
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
