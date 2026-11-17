import type { CommitWindow } from '../../insights/commits';
import { commitTiles } from '../../insights/commit-pulse';
import type { Lang, Messages } from '../shared';
import { Delta } from './delta';
import { fill, formatDuration, formatNumber, shortDay } from './format';
import { type Tile, Tiles } from './kpis';

/**
 * The Activity tab's headline in commits to main: shipped this week (landed
 * and in production now), commits this week against last, what waits for
 * production and how much landed directly rather than through a pull
 * request.
 */
export function CommitTiles({
  t,
  lang,
  commits,
  today,
  now,
}: {
  t: Messages;
  lang: Lang;
  commits: CommitWindow;
  today: string;
  now: number;
}) {
  const tiles = commitTiles({ commits, today, now });
  const n = (value: number) => formatNumber(value, lang);
  const share =
    tiles.direct.share === null
      ? '—'
      : new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
          style: 'percent',
          maximumFractionDigits: 0,
        }).format(tiles.direct.share);
  const waiting = tiles.waiting;
  const list: Tile[] = [
    {
      id: 'shipped',
      label: t.stats.shippedWeek,
      value: n(tiles.shipped),
      delta: null,
      note: t.commits.shippedNote,
      tone: 'shipped',
    },
    {
      id: 'landed',
      label: t.commits.landedWeek,
      value: n(tiles.landed.current),
      delta: tiles.landed.change ? (
        <Delta value={tiles.landed.change} t={t} lang={lang} />
      ) : null,
      note:
        tiles.asOf === today
          ? undefined
          : fill(t.commits.asOf, { date: shortDay(tiles.asOf, lang) }),
      tone: 'merged',
      href: '#pulse',
    },
    {
      id: 'waiting',
      label: t.commits.waitingNow,
      value: waiting ? n(waiting.count) : '—',
      delta: null,
      note: !waiting
        ? t.pulse.notAvailable
        : waiting.oldestMs === null
          ? t.commits.noneWaiting
          : fill(t.commits.oldest, {
              age: formatDuration(waiting.oldestMs, t, lang),
            }),
      tone: 'waiting',
      href: '#updates',
    },
    {
      id: 'direct',
      label: t.commits.direct,
      value: share,
      delta: null,
      note: fill(t.commits.directNote, {
        direct: n(tiles.direct.direct),
        viaPr: n(tiles.direct.viaPr),
      }),
      tone: 'live',
    },
  ];
  return <Tiles className="kpis activity-kpis activity-commits" list={list} />;
}
