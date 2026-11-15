import type { ReactNode } from 'react';
import type { Insights } from '../../insights/model';
import type { RoadmapView } from '../../view-model';
import type { Lang, Messages } from '../shared';
import { Delta, plural } from './delta';
import { fill, formatDuration, formatNumber } from './format';

type Tile = {
  id: string;
  label: string;
  value: string;
  of?: string;
  delta: ReactNode;
  note?: string;
  tone: 'merged' | 'shipped' | 'live' | 'waiting';
  href?: string;
};

/**
 * Three headline figures, each with its week-over-week change. "Waiting for
 * prod sync" is the emphasised tile: merged work that production does not
 * run yet. Deliverables shipped this week lead the Activity tab
 * (ShippedTile).
 */
export function KpiTiles({
  t,
  lang,
  view,
  insights,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  insights: Insights;
}) {
  const { tiles, waitAge } = insights;
  const merged = tiles.merged;
  const n = (value: number) => formatNumber(value, lang);
  const list: Tile[] = [
    {
      id: 'merged',
      label: t.stats.mergedWeek,
      value: tiles.mergedThisWeek === null ? '—' : n(tiles.mergedThisWeek),
      delta: merged ? (
        <Delta value={merged} t={t} lang={lang} />
      ) : (
        <Delta
          value={tiles.trackedMerged}
          t={t}
          lang={lang}
          label={t.stats.trackedVsLastWeek}
        />
      ),
      note:
        tiles.mergedThisWeek === null
          ? `${t.stats.allNotAvailable} · ${plural(
              t.stats.trackedNote,
              tiles.trackedMerged.current,
              lang
            )}`
          : plural(t.stats.trackedNote, tiles.trackedMerged.current, lang),
      tone: 'merged',
      href: '#pulse',
    },
    {
      id: 'live',
      label: t.stats.live,
      value: n(tiles.live.total),
      of: fill(t.stats.ofTotal, { n: n(view.total) }),
      delta: <Delta value={tiles.live.added} t={t} lang={lang} />,
      note: plural(t.stats.newThisWeek, tiles.live.added.current, lang),
      tone: 'live',
    },
    {
      id: 'waiting',
      label: t.stats.waiting,
      value: n(tiles.waiting.total),
      of: fill(t.stats.ofTotal, { n: n(view.total) }),
      delta: (
        <Delta value={tiles.waiting.added} t={t} lang={lang} good="down" />
      ),
      note: [
        plural(t.stats.newThisWeek, tiles.waiting.added.current, lang),
        waitAge.medianMs !== null
          ? fill(t.stats.waitAge, {
              median: formatDuration(waitAge.medianMs, t, lang),
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: 'waiting',
      href: '#updates',
    },
  ];
  return <Tiles list={list} />;
}

/**
 * Deliverables shipped in the last 7 days against the 7 before, as a
 * compact stat at the top of the Activity tab (the pulse below counts PRs).
 */
export function ShippedTile({
  t,
  lang,
  insights,
}: {
  t: Messages;
  lang: Lang;
  insights: Insights;
}) {
  const { shipped } = insights.tiles;
  return (
    <Tiles
      className="kpis activity-kpis"
      list={[
        {
          id: 'shipped',
          label: t.stats.shippedWeek,
          value: formatNumber(shipped.current, lang),
          delta: <Delta value={shipped} t={t} lang={lang} />,
          tone: 'shipped',
        },
      ]}
    />
  );
}

function Tiles({
  list,
  className = 'kpis',
}: {
  list: Tile[];
  className?: string;
}) {
  return (
    <ul className={className}>
      {list.map((tile) => {
        const body = (
          <>
            <span className="kpi-label">{tile.label}</span>
            <span className="kpi-value">
              {tile.value}
              {tile.of ? <span className="kpi-of"> {tile.of}</span> : null}
            </span>
            {tile.delta}
            {tile.note ? (
              <span className="kpi-note" title={tile.note}>
                {tile.note}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={tile.id} className={`kpi kpi-${tile.tone}`}>
            {tile.href ? (
              <a className="kpi-body" href={tile.href}>
                {body}
              </a>
            ) : (
              <div className="kpi-body">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
