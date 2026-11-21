'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useFormatter, useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type HealthRange,
  markerMatches,
  type MarkerInput,
  type SeriesPoint,
  type ServiceHealth,
} from '@/lib/observability-health/summary';
import { STATUS_BADGE } from './health-badges';

type MetricKey = 'cpuP99Ms' | 'errorRate' | 'p95Ms' | 'requests';

const CHARTS: { color: string; key: MetricKey }[] = [
  { color: 'var(--chart-1)', key: 'requests' },
  { color: 'var(--chart-4)', key: 'errorRate' },
  { color: 'var(--chart-2)', key: 'p95Ms' },
  { color: 'var(--chart-3)', key: 'cpuP99Ms' },
];

export function HealthDrilldown({
  markers,
  markersAvailable,
  range,
  series,
  service,
  summary,
}: {
  markers: MarkerInput[];
  markersAvailable: boolean;
  range: HealthRange;
  series: SeriesPoint[] | null;
  service: string;
  summary: ServiceHealth | null;
}) {
  const t = useTranslations('observability-health');
  const format = useFormatter();
  const deploys = markers.filter((marker) =>
    markerMatches(service, marker.service)
  );

  const tick = (value: string) =>
    format.dateTime(new Date(value), {
      ...(range === '24h'
        ? { hour: '2-digit', minute: '2-digit' }
        : { day: 'numeric', hour: '2-digit', month: 'short' }),
    });

  return (
    <section
      aria-labelledby="health-drilldown-title"
      className="space-y-4 rounded-lg border bg-card px-4 py-4 md:px-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2
          className="font-semibold text-base tracking-tight"
          id="health-drilldown-title"
        >
          {service}
        </h2>
        {summary ? (
          <Badge variant={STATUS_BADGE[summary.status]}>
            {t(`status.${summary.status}`)}
          </Badge>
        ) : null}
        <p className="text-muted-foreground text-sm">
          {markersAvailable
            ? t('deploys_in_range', { count: deploys.length })
            : t('deploys_unavailable')}
        </p>
      </div>

      {series === null ? (
        <p className="text-sm" role="alert">
          {t('series_error')}
        </p>
      ) : series.every((point) => point.requests === null) ? (
        <p className="text-muted-foreground text-sm">{t('series_empty')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {CHARTS.map(({ color, key }) => {
            const config = {
              [key]: { color, label: t(`charts.${key}`) },
            } satisfies ChartConfig;
            return (
              <figure className="space-y-2" key={key}>
                <figcaption className="font-medium text-sm">
                  {t(`charts.${key}`)}
                </figcaption>
                <ChartContainer className="h-48 w-full" config={config}>
                  <LineChart data={series} margin={{ left: 4, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="at"
                      minTickGap={32}
                      tickFormatter={tick}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(value: number) =>
                        key === 'errorRate'
                          ? format.number(value, {
                              maximumFractionDigits: 1,
                              style: 'percent',
                            })
                          : format.number(value, { notation: 'compact' })
                      }
                      tickLine={false}
                      width={48}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => tick(String(label))}
                        />
                      }
                    />
                    {deploys.map((marker) => (
                      <ReferenceLine
                        key={marker.version_id}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="4 4"
                        x={nearestPoint(series, marker.deployed_at)}
                      />
                    ))}
                    <Line
                      connectNulls={false}
                      dataKey={key}
                      dot={false}
                      isAnimationActive={false}
                      stroke={`var(--color-${key})`}
                      strokeWidth={2}
                      type="monotone"
                    />
                  </LineChart>
                </ChartContainer>
              </figure>
            );
          })}
        </div>
      )}

      {deploys.length > 0 ? (
        <ul className="space-y-1 text-muted-foreground text-sm">
          {deploys.slice(0, 10).map((marker) => (
            <li key={marker.version_id}>
              {t('deployed', {
                sha: marker.sha?.slice(0, 7) ?? marker.version_id,
                time: format.dateTime(new Date(marker.deployed_at), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** The chart point a deploy falls into, so its marker aligns with the x axis. */
function nearestPoint(series: SeriesPoint[], at: string) {
  const time = Date.parse(at);
  let best = series[0]?.at;
  for (const point of series) {
    if (Date.parse(point.at) <= time) best = point.at;
    else break;
  }
  return best;
}
