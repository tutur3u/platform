import { formatNumber } from '@tuturuuu/roadmap-core/components/insights/format.ts';
import {
  ChartCard,
  ChartTable,
} from '@tuturuuu/roadmap-core/components/ds/chart-card.tsx';
import { LazyChartBars } from '@tuturuuu/roadmap-core/components/ds/lazy-chart.tsx';
import { Segmented } from '@tuturuuu/roadmap-core/components/ds/segmented.tsx';
import type {
  Lang,
  Messages,
} from '@tuturuuu/roadmap-core/components/shared.tsx';
import type { RoadmapView } from '@tuturuuu/roadmap-core/view-model.ts';
import { useState } from 'react';
import { PRODUCT_KEYS, type Product, productProgress } from './pulse-data';

type Range = '7' | '30';

/**
 * Commits to main per product over 7 or 30 days as ranked bars; the tooltip
 * adds how far the product's roadmap track has come.
 */
export function PulseProducts({
  t,
  lang,
  view,
  data,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  data: readonly Product[];
}) {
  const [range, setRange] = useState<Range>('7');
  const copy = t.pulseRoadmap;
  const n = (value: number) => formatNumber(value, lang);
  const byKey = new Map(data.map((product) => [product.key, product]));
  const rows = PRODUCT_KEYS.map((key) => {
    const product = byKey.get(key);
    return {
      key,
      name: copy.product[key],
      commits: (range === '7' ? product?.commits7d : product?.commits30d) ?? 0,
    };
  }).sort((a, b) => b.commits - a.commits);

  return (
    <ChartCard
      id="pulse-products-title"
      title={copy.productsTitle}
      description={copy.productsSubtitle}
      actions={
        <Segmented
          label={copy.range}
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: copy.week },
            { value: '30', label: copy.month },
          ]}
        />
      }
    >
      <LazyChartBars
        slotClassName="h-[28rem]"
        label={`${copy.productsTitle}, ${range === '7' ? copy.week : copy.month}`}
        data={rows}
        xKey="name"
        horizontal
        legend={false}
        categoryWidth={92}
        series={[
          { key: 'commits', label: copy.commits, color: 'var(--chart-1)' },
        ]}
        valueFormatter={n}
        tooltipFooter={(row) => {
          const key = rows.find((entry) => entry.name === row.name)?.key;
          if (!key) return null;
          const progress = productProgress(view, key);
          return (
            <p className="border-t pt-1.5 text-muted-foreground">
              {n(progress.shipped)} {copy.shipped} · {n(progress.inProgress)}{' '}
              {copy.inProgress} · {n(progress.next)} {copy.next}
            </p>
          );
        }}
      />
      <ChartTable
        caption={copy.productsTitle}
        columns={[copy.commits]}
        rows={rows.map((row) => ({
          label: row.name,
          values: [n(row.commits)],
        }))}
      />
    </ChartCard>
  );
}
