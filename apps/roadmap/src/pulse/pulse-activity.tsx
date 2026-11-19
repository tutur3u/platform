import {
  ChartCard,
  ChartTable,
} from '@tuturuuu/roadmap-core/components/ds/chart-card.tsx';
import { LazyChartHeatmap } from '@tuturuuu/roadmap-core/components/ds/lazy-chart.tsx';
import {
  fill,
  formatNumber,
  longDay,
  shortDay,
} from '@tuturuuu/roadmap-core/components/insights/format.ts';
import {
  formatDate,
  type Lang,
  type Messages,
} from '@tuturuuu/roadmap-core/components/shared.tsx';
import { REPO_URL } from '@tuturuuu/roadmap-core/live/model.ts';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import type { RoadmapSnapshot } from '../roadmap-snapshot';
import { calendarDays, PRODUCT_KEYS } from './pulse-data';
import { ProductIcon } from './pulse-icons';

const environments = ['production', 'database', 'staging'] as const;

/** Deployments by environment, newest first; the one serving now is marked. */
export function ReleaseTrain({
  copy,
  lang,
  snapshot,
}: {
  copy: Messages['pulseRoadmap'];
  lang: Lang;
  snapshot: RoadmapSnapshot | null;
}) {
  const deployments = [...(snapshot?.deploys ?? [])].sort((a, b) =>
    b.at.localeCompare(a.at)
  );
  return (
    <ChartCard
      id="pulse-train-title"
      title={copy.train}
      description={copy.trainSubtitle}
    >
      {deployments.length === 0 && (
        <p className="text-muted-foreground text-sm">{copy.emptyTrain}</p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {environments.map((environment) => {
          const rows = deployments.filter(({ env }) => env === environment);
          if (rows.length === 0) return null;
          return (
            <Card key={environment} className="shadow-none">
              <CardContent className="grid gap-2 p-4">
                <h3 className="font-medium text-sm">
                  {copy.environments[environment]}
                </h3>
                <ol className="grid gap-1">
                  {rows.slice(0, 6).map(({ sha, at, apps }) => (
                    <li key={sha}>
                      <a
                        href={`${REPO_URL}/commit/${sha}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-sm outline-ring/50 hover:bg-accent focus-visible:outline-2"
                      >
                        <code>{sha.slice(0, 7)}</code>
                        <time
                          dateTime={at}
                          className="text-muted-foreground tabular-nums"
                        >
                          {formatDate(at, lang, true)}
                        </time>
                        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
                          {sha === snapshot?.productionSha && (
                            <Badge variant="success">{copy.live}</Badge>
                          )}
                          {fill(copy.appCount, {
                            count: formatNumber(apps ?? 1, lang),
                          })}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ChartCard>
  );
}

/** Commits per product and Vietnam calendar day as one hover, focus and tap grid. */
export function ProductHeatmap({
  copy,
  lang,
  snapshot,
}: {
  copy: Messages['pulseRoadmap'];
  lang: Lang;
  snapshot: RoadmapSnapshot | null;
}) {
  const dates = snapshot ? calendarDays(snapshot.generatedAt) : [];
  const byKey = new Map(
    snapshot?.products.map((product) => [product.key, product]) ?? []
  );
  const rows = PRODUCT_KEYS.flatMap((key) => {
    const product = byKey.get(key);
    return product ? [{ ...product, key }] : [];
  }).sort((a, b) => b.commits30d - a.commits30d);
  const count = (value: number) =>
    fill(value === 1 ? copy.commitOne : copy.commitMany, {
      count: formatNumber(value, lang),
    });

  return (
    <ChartCard
      id="pulse-heat-title"
      title={copy.heat}
      description={copy.heatSubtitle}
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.unavailable}</p>
      ) : (
        <>
          <LazyChartHeatmap
            slotClassName="h-[30rem]"
            label={copy.heat}
            valueLabel={count}
            legend={{ less: copy.less, more: copy.more }}
            columns={dates.map((day, index) => ({
              key: day,
              label: longDay(day, lang),
              tick:
                index === 0 || index === 14 || index === dates.length - 1
                  ? shortDay(day, lang)
                  : undefined,
            }))}
            rows={rows.map((product) => ({
              key: product.key,
              name: copy.product[product.key],
              values: product.daily,
              label: (
                <>
                  <ProductIcon product={product.key} size={15} />
                  {copy.product[product.key]}
                </>
              ),
            }))}
          />
          <ChartTable
            caption={copy.heat}
            columns={[copy.week, copy.month]}
            rows={rows.map((product) => ({
              label: copy.product[product.key],
              values: [
                formatNumber(product.commits7d, lang),
                formatNumber(product.commits30d, lang),
              ],
            }))}
          />
        </>
      )}
    </ChartCard>
  );
}
