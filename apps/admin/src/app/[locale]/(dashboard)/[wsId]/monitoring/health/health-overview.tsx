import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { SourceRun } from '@/lib/observability-health/load';
import {
  HEALTH_RANGES,
  type HealthRange,
  type ServiceHealth,
} from '@/lib/observability-health/summary';
import { healthHref, STATUS_BADGE } from './health-badges';

export async function HealthOverview({
  baseHref,
  markersAvailable,
  range,
  runs,
  selected,
  summaries,
}: {
  baseHref: string;
  markersAvailable: boolean;
  range: HealthRange;
  /** Null when the run log could not be read. */
  runs: SourceRun[] | null;
  selected: string | null;
  summaries: ServiceHealth[] | null;
}) {
  const t = await getTranslations('observability-health');
  const format = await getFormatter();
  const percent = (value: number | null) =>
    value === null
      ? t('none')
      : format.number(value, { maximumFractionDigits: 2, style: 'percent' });
  const ms = (value: number | null) =>
    value === null
      ? t('none')
      : t('milliseconds', {
          value: format.number(value, { maximumFractionDigits: 0 }),
        });
  const latestRun = runs?.[0];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="font-semibold text-base tracking-tight">
            {t('title')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {runs === null
              ? t('runs_unavailable')
              : latestRun
                ? t('last_run', {
                    source: latestRun.source,
                    status: t(`run_status.${runStatus(latestRun.status)}`),
                    time: format.relativeTime(new Date(latestRun.recorded_at)),
                  })
                : t('no_runs')}
          </p>
        </div>
        <nav aria-label={t('range_label')} className="flex flex-wrap gap-2">
          {HEALTH_RANGES.map((option) => (
            <Button
              asChild
              key={option}
              size="sm"
              variant={option === range ? 'default' : 'outline'}
            >
              <Link
                aria-current={option === range ? 'page' : undefined}
                href={healthHref(baseHref, option, selected)}
              >
                {t(`ranges.${option}`)}
              </Link>
            </Button>
          ))}
        </nav>
      </div>

      {summaries === null ? (
        <p
          className="rounded-lg border bg-card px-4 py-4 text-sm md:px-5"
          role="alert"
        >
          {t('load_error')}
        </p>
      ) : summaries.length === 0 ? (
        <div className="space-y-1 rounded-lg border bg-card px-4 py-4 md:px-5">
          <p className="font-medium text-sm">{t('empty.title')}</p>
          <p className="text-muted-foreground text-sm">
            {t('empty.description')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.service')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="text-end">{t('columns.rate')}</TableHead>
                <TableHead className="text-end">
                  {t('columns.errors')}
                </TableHead>
                <TableHead className="text-end">{t('columns.p95')}</TableHead>
                <TableHead className="text-end">{t('columns.cpu')}</TableHead>
                <TableHead className="text-end">{t('columns.do')}</TableHead>
                <TableHead className="text-end">
                  {t('columns.coverage')}
                </TableHead>
                <TableHead>{t('columns.deploy')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((entry) => (
                <TableRow
                  data-state={
                    entry.service === selected ? 'selected' : undefined
                  }
                  key={entry.service}
                >
                  <TableCell className="font-medium">
                    <Link
                      aria-current={
                        entry.service === selected ? 'page' : undefined
                      }
                      className="underline-offset-4 hover:underline"
                      href={healthHref(baseHref, range, entry.service)}
                    >
                      {entry.service}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[entry.status]}>
                      {t(`status.${entry.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {entry.requestsPerMinute === null
                      ? t('none')
                      : t('per_minute', {
                          value: format.number(entry.requestsPerMinute, {
                            maximumFractionDigits: 1,
                          }),
                        })}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {percent(entry.errorRate)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {ms(entry.p95Ms)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {ms(entry.cpuP99Ms)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {percent(entry.doErrorRate)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {percent(entry.coverage)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {!markersAvailable
                      ? t('deploys_unavailable')
                      : entry.latestDeploy
                        ? t('deployed', {
                            sha:
                              entry.latestDeploy.sha?.slice(0, 7) ??
                              entry.latestDeploy.version_id,
                            time: format.relativeTime(
                              new Date(entry.latestDeploy.deployed_at)
                            ),
                          })
                        : t('none')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

const RUN_STATUSES = [
  'done',
  'budget_exhausted',
  'stopped',
  'stale',
  'failed',
  'unknown',
] as const;

function runStatus(value: string): (typeof RUN_STATUSES)[number] {
  return (RUN_STATUSES as readonly string[]).includes(value)
    ? (value as (typeof RUN_STATUSES)[number])
    : 'unknown';
}
