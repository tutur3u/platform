import { useMemo } from 'react';
import { TRACK_NAMES } from '../../content/track-names';
import type { PulsePoint } from '../../insights/pulse-model';
import { ChartTable } from '../ds/chart-card';
import { LazyChartBars } from '../ds/lazy-chart';
import type { Lang, Messages } from '../shared';
import { formatNumber, longDay, shortDay } from './format';

/** What the bars count: merged pull requests or commits to main. */
export type PulseFlow = 'prs' | 'commits';

function productsValue(point: PulsePoint, t: Messages) {
  const products = point.products.map((id) => TRACK_NAMES[id] ?? id);
  if (!products.length) return t.pulse.none;
  return products.length > 4
    ? `${products.slice(0, 4).join(', ')} +${products.length - 4}`
    : products.join(', ');
}

/**
 * Each day split into parts that add up to its bar: commits in production
 * and waiting on main, or merged PRs in production, tracked but not yet in
 * production, and the rest. A day with no all-PR count draws what is known.
 */
function seriesFor(flow: PulseFlow, t: Messages) {
  return flow === 'commits'
    ? [
        { key: 'inProd', label: t.commits.inProd, color: 'var(--pc-prod)' },
        {
          key: 'waiting',
          label: t.commits.waiting,
          color: 'var(--pc-tracked)',
        },
      ]
    : [
        { key: 'inProd', label: t.pulse.inProd, color: 'var(--pc-prod)' },
        {
          key: 'waiting',
          label: t.pulse.trackedWaiting,
          color: 'var(--pc-tracked)',
        },
        { key: 'other', label: t.pulse.untracked, color: 'var(--pc-all)' },
      ];
}

function datum(
  point: PulsePoint,
  flow: PulseFlow
): Record<string, string | number | null> & { day: string } {
  const known = point.all !== null;
  return flow === 'commits'
    ? {
        day: point.day,
        inProd: point.inProd,
        waiting: Math.max(0, (point.all ?? 0) - point.inProd),
        ma: point.ma,
      }
    : {
        day: point.day,
        inProd: point.inProd,
        waiting: Math.max(0, point.tracked - point.inProd),
        other: known ? Math.max(0, (point.all ?? 0) - point.tracked) : 0,
        ma: point.ma,
      };
}

/**
 * The daily pulse as the shared stacked bar chart: a tooltip on hover, focus
 * (arrow keys) and tap lists the day's parts, the 7-day average and the
 * products touched; the figures are also in a visually hidden table.
 */
export function PulseChart({
  points,
  t,
  lang,
  flow = 'prs',
}: {
  points: readonly PulsePoint[];
  t: Messages;
  lang: Lang;
  today?: string;
  flow?: PulseFlow;
}) {
  const series = useMemo(() => seriesFor(flow, t), [flow, t]);
  const data = useMemo(
    () => points.map((point) => datum(point, flow)),
    [points, flow]
  );
  const byDay = useMemo(
    () => new Map(points.map((point) => [point.day, point])),
    [points]
  );
  const n = (value: number) => formatNumber(value, lang);
  const na = t.pulse.notAvailable;
  const label = flow === 'commits' ? t.commits.chart : t.pulse.chart;

  return (
    <>
      <LazyChartBars
        slotClassName="h-72"
        label={label}
        data={data}
        xKey="day"
        series={series}
        line={{
          key: 'ma',
          label: t.pulse.average,
          color: 'var(--foreground)',
        }}
        stacked
        legend
        valueFormatter={(value) => (Number.isNaN(value) ? na : n(value))}
        tickFormatter={(day) => shortDay(day, lang)}
        labelFormatter={(day) => longDay(String(day), lang)}
        tooltipFooter={(row) => {
          const point = byDay.get(String(row.day));
          if (!point) return null;
          return (
            <dl className="grid gap-1 border-t pt-1.5 text-muted-foreground">
              {point.all === null && flow === 'prs' ? (
                <dd>{t.pulse.allUnavailable}</dd>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt>{t.pulse.products}</dt>
                <dd className="max-w-36 text-right text-foreground">
                  {productsValue(point, t)}
                </dd>
              </div>
            </dl>
          );
        }}
      />
      <ChartTable
        caption={t.pulse.table}
        columns={[...series.map((s) => String(s.label)), t.pulse.average]}
        rows={data.map((row) => ({
          label: longDay(row.day, lang),
          values: [
            ...series.map((s) => n(Number(row[s.key as keyof typeof row]))),
            row.ma === null ? na : formatNumber(Number(row.ma), lang, 1),
          ],
        }))}
      />
    </>
  );
}
