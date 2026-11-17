import type { ReactNode } from 'react';
import type { Insights } from '../../insights/model';
import type { RoadmapView } from '../../view-model';
import type { Lang, Messages } from '../shared';
import { Delta, Flow, plural } from './delta';
import { fill, formatDuration, formatNumber } from './format';

export type Tile = {
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
 * Three headline figures with equal weight. Merged PRs carry a week-over-week
 * change; live and waiting deliverables carry this week's flow into that
 * state as a count, since a percentage of the running total misleads.
 * Commits shipped this week lead the Activity tab (CommitTiles).
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
      delta: <Flow value={tiles.live.added} t={t} lang={lang} tone="good" />,
      note: plural(t.stats.weekBefore, tiles.live.added.previous, lang),
      tone: 'live',
    },
    {
      id: 'waiting',
      label: t.stats.waiting,
      value: n(tiles.waiting.total),
      of: fill(t.stats.ofTotal, { n: n(view.total) }),
      delta: (
        <Flow value={tiles.waiting.added} t={t} lang={lang} tone="neutral" />
      ),
      // The queue's health is how long work waits, not how much entered it.
      note:
        waitAge.medianMs !== null
          ? fill(t.stats.waitAge, {
              median: formatDuration(waitAge.medianMs, t, lang),
            })
          : plural(t.stats.weekBefore, tiles.waiting.added.previous, lang),
      tone: 'waiting',
      href: '#updates',
    },
  ];
  return <Tiles list={list} />;
}

/**
 * Deliverables shipped in the last 7 days against the 7 before: the Activity
 * tab's headline when the build has no commit history (CommitTiles).
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

export function Tiles({
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
