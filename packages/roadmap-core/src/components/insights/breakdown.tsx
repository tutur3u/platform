import { TRACK_NAMES } from '../../content/track-names';
import type { Lang, Messages } from '../shared';
import { formatNumber } from './format';

const SHOWN = 6;

/**
 * Per-product counts over the range: labelled bars, numbers always visible.
 * Work no public product claims (internal, client and unscoped changes) is a
 * count beside the bars, so it never dwarfs them.
 */
export function Breakdown({
  t,
  lang,
  products,
  scope,
}: {
  t: Messages;
  lang: Lang;
  products: readonly { track: string; count: number }[];
  scope: string;
}) {
  if (!products.length) return null;
  const named = products.filter((entry) => entry.track !== 'other');
  const rest = named.slice(SHOWN).reduce((sum, entry) => sum + entry.count, 0);
  const other = products.find((entry) => entry.track === 'other')?.count ?? 0;
  const rows = [
    ...named.slice(0, SHOWN).map((entry) => ({
      id: entry.track,
      name: TRACK_NAMES[entry.track] ?? entry.track,
      count: entry.count,
    })),
    ...(rest ? [{ id: 'rest', name: t.pulse.other, count: rest }] : []),
  ];
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="breakdown">
      <h3>
        {t.pulse.breakdown} <span>· {scope}</span>
      </h3>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <span className="breakdown-name">{row.name}</span>
            <span className="breakdown-bar" aria-hidden>
              <span style={{ width: `${(row.count / max) * 100}%` }} />
            </span>
            <span className="breakdown-count">
              {formatNumber(row.count, lang)}
            </span>
          </li>
        ))}
      </ul>
      {other ? (
        <p className="breakdown-other">
          {t.pulse.otherWork}: <b>{formatNumber(other, lang)}</b>
        </p>
      ) : null}
    </div>
  );
}
