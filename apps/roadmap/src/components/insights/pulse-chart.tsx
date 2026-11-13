import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { TRACK_NAMES } from '../../content/track-names';
import { axisRank, nextIndex, niceMax } from '../../insights/chart-nav';
import type { PulsePoint } from '../../insights/pulse-model';
import type { Lang, Messages } from '../shared';
import { formatNumber, longDay, shortDay } from './format';

function productNames(ids: readonly string[]) {
  return ids.map((id) => TRACK_NAMES[id] ?? id);
}

/** The words a tooltip and the live region read for one day. */
export function dayRows(point: PulsePoint, t: Messages, lang: Lang) {
  const n = (value: number) => formatNumber(value, lang);
  const products = productNames(point.products);
  return [
    {
      key: 'all',
      label: t.pulse.all,
      value: point.all === null ? t.pulse.notAvailable : n(point.all),
    },
    { key: 'tracked', label: t.pulse.tracked, value: n(point.tracked) },
    { key: 'inProd', label: t.pulse.inProd, value: n(point.inProd) },
    {
      key: 'average',
      label: t.pulse.average,
      value:
        point.ma === null
          ? t.pulse.notAvailable
          : formatNumber(point.ma, lang, 1),
    },
    { key: 'deploys', label: t.pulse.deploys, value: n(point.deploys) },
    {
      key: 'products',
      label: t.pulse.products,
      value: products.length
        ? products.length > 4
          ? `${products.slice(0, 4).join(', ')} +${products.length - 4}`
          : products.join(', ')
        : t.pulse.none,
    },
  ];
}

/** The hidden table's figures (products touched stay in the tooltip). */
function tableRows(point: PulsePoint, t: Messages, lang: Lang) {
  return dayRows(point, t, lang).filter((row) => row.key !== 'products');
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * One path per series (a rectangle per day): far fewer nodes and bytes than
 * a rect per bar. `na` draws a full-height band on days with no all-PR count.
 */
export function barsPath(
  points: readonly PulsePoint[],
  max: number,
  series: 'all' | 'tracked' | 'inProd' | 'na'
) {
  let d = '';
  points.forEach((point, index) => {
    const value =
      series === 'na'
        ? point.all === null
          ? max
          : 0
        : series === 'all'
          ? (point.all ?? 0)
          : point[series];
    const height = round((value / max) * 100);
    if (height <= 0) return;
    d += `M${index * 10 + 1.5} ${round(100 - height)}h7v${height}h-7z`;
  });
  return d;
}

function linePath(points: readonly PulsePoint[], max: number) {
  let path = '';
  let open = false;
  points.forEach((point, index) => {
    if (point.ma === null) {
      open = false;
      return;
    }
    const x = index * 10 + 5;
    const y = 100 - (point.ma / max) * 100;
    path += `${open ? 'L' : 'M'}${x} ${round(y)}`;
    open = true;
  });
  return path;
}

/**
 * Interactive daily chart: SVG marks under a row of real buttons, one per
 * day, so hover, tap and keyboard all select a day. Arrow keys, Home, End,
 * PageUp and PageDown move a roving focus; the tooltip is a polite live
 * region; a visually hidden table carries every figure.
 */
export function PulseChart({
  points,
  t,
  lang,
  today,
}: {
  points: readonly PulsePoint[];
  t: Messages;
  lang: Lang;
  today: string;
}) {
  const count = points.length;
  const [focusIndex, setFocusIndex] = useState(count - 1);
  const [active, setActive] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tooltipId = useId();
  const roving = Math.min(focusIndex, count - 1);
  const max = niceMax(
    Math.max(
      1,
      ...points.map((p) => Math.max(p.all ?? 0, p.tracked, p.ma ?? 0))
    )
  );
  const step = Math.max(1, Math.ceil(count / 7));
  const shown = active === null ? null : points[active];

  const select = (index: number, focus: boolean) => {
    setFocusIndex(index);
    setActive(index);
    if (focus) buttons.current[index]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    const next = nextIndex(event.key, roving, count);
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - box.left) / box.width) * count);
    if (index >= 0 && index < count && index !== active) setActive(index);
  };
  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (!event.currentTarget.contains(document.activeElement)) setActive(null);
  };

  const align =
    active === null
      ? 'center'
      : active < count * 0.2
        ? 'start'
        : active > count * 0.8
          ? 'end'
          : 'center';

  return (
    <div className="pchart">
      <div className="pchart-plot">
        <div className="pchart-grid" aria-hidden>
          {[1, 0.5, 0].map((share) => (
            <span key={share} style={{ bottom: `${share * 100}%` }}>
              {formatNumber(max * share, lang)}
            </span>
          ))}
        </div>
        <svg
          className="pchart-svg"
          viewBox={`0 0 ${count * 10} 100`}
          preserveAspectRatio="none"
          aria-hidden
          focusable="false"
        >
          {active !== null ? (
            <rect
              className="pchart-hover"
              x={active * 10}
              y={0}
              width={10}
              height={100}
            />
          ) : null}
          <path className="bar-na" d={barsPath(points, max, 'na')} />
          <path className="bar-all" d={barsPath(points, max, 'all')} />
          <path className="bar-tracked" d={barsPath(points, max, 'tracked')} />
          <path className="bar-prod" d={barsPath(points, max, 'inProd')} />
          <path
            className="pchart-ma"
            d={linePath(points, max)}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="pchart-hits"
          role="group"
          aria-label={t.pulse.chart}
          onKeyDown={onKeyDown}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setActive(null);
          }}
        >
          {points.map((point, index) => (
            <button
              key={point.day}
              type="button"
              ref={(element) => {
                buttons.current[index] = element;
              }}
              tabIndex={index === roving ? 0 : -1}
              aria-label={longDay(point.day, lang)}
              aria-pressed={active === index}
              className="pchart-hit"
              onFocus={() => select(index, false)}
              onClick={() =>
                active === index ? setActive(null) : select(index, false)
              }
            />
          ))}
        </div>
        <p id={tooltipId} className="sr-only" role="status" aria-live="polite">
          {shown
            ? `${longDay(shown.day, lang)}: ${dayRows(shown, t, lang)
                .map((row) => `${row.label} ${row.value}`)
                .join('; ')}`
            : ''}
        </p>
        <div
          className="pchart-tip"
          aria-hidden
          data-align={align}
          hidden={shown === null || shown === undefined}
          style={
            active === null
              ? undefined
              : ({
                  '--tip-x': `${((active + 0.5) / count) * 100}%`,
                } as CSSProperties)
          }
        >
          {shown ? (
            <>
              <strong>
                {shown.day === today ? `${t.pulse.today} · ` : ''}
                {longDay(shown.day, lang)}
              </strong>
              <dl>
                {dayRows(shown, t, lang).map((row) => (
                  <div key={row.key} className={`tip-${row.key}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>
      </div>
      <div className="pchart-axis" aria-hidden>
        {points.map((point, index) => {
          const rank = axisRank(index, count, step);
          return (
            <span
              key={point.day}
              data-rank={rank ?? undefined}
              className={index === count - 1 ? 'is-today' : undefined}
            >
              {rank === null
                ? ''
                : point.day === today
                  ? t.pulse.today
                  : shortDay(point.day, lang)}
            </span>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>{t.pulse.table}</caption>
        <thead>
          <tr>
            <th scope="col">{t.pulse.day}</th>
            {tableRows(points[0] as PulsePoint, t, lang).map((row) => (
              <th scope="col" key={row.key}>
                {row.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{shortDay(point.day, lang)}</th>
              {tableRows(point, t, lang).map((row) => (
                <td key={row.key}>{row.value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
