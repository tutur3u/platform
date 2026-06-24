'use client';

import { Activity, Gauge, HardDrive, Radio } from '@tuturuuu/icons';
import type { InfrastructureStressTestRun } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/platform/next-link-shim';
import {
  formatBytes,
  formatClockTime,
  formatDecimalNumber,
  formatLatencyMs,
  formatPercent,
} from './formatters';
import { MetricBlock } from './metric-block';
import { useInfrastructureStressTestRun } from './query-hooks';

export function RunStatusBadge({
  status,
}: {
  status: InfrastructureStressTestRun['status'];
}) {
  return (
    <Badge variant="outline" className="rounded-full border-border/70">
      {status}
    </Badge>
  );
}

function getRunWindowHref({
  locale,
  run,
  wsId,
}: {
  locale?: string;
  run: InfrastructureStressTestRun;
  wsId: string;
}) {
  const since = run.startedAt ?? run.queuedAt;
  const until = run.endedAt ?? Date.now();
  const params = new URLSearchParams({
    q: run.id,
    since: String(since),
    until: String(until),
  });
  const prefix = locale ? `/${locale}/${wsId}` : `/${wsId}`;

  return `${prefix}/infrastructure/monitoring/requests?${params.toString()}`;
}

function getSpike(run: InfrastructureStressTestRun, metric: 'cpu' | 'memory') {
  return run.resourceSpikes.find((spike) => spike.metric === metric) ?? null;
}

export function InfrastructureStressTestRunSummary({
  locale,
  refreshRunDetails = false,
  run,
  wsId,
}: {
  locale?: string;
  refreshRunDetails?: boolean;
  run: InfrastructureStressTestRun;
  wsId: string;
}) {
  const t = useTranslations('blue-green-monitoring.stress_tests');
  const runQuery = useInfrastructureStressTestRun({
    enabled: refreshRunDetails,
    initialData: run,
    runId: run.id,
  });
  const displayedRun = runQuery.data ?? run;
  const cpuSpike = getSpike(displayedRun, 'cpu');
  const memorySpike = getSpike(displayedRun, 'memory');

  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-lg">
              {displayedRun.target.label}
            </h2>
            <RunStatusBadge status={displayedRun.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {displayedRun.profile.label} -{' '}
            {formatClockTime(displayedRun.startedAt ?? displayedRun.queuedAt)}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={getRunWindowHref({ locale, run: displayedRun, wsId })}>
            {t('actions.inspect')}
          </Link>
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricBlock
          icon={<Gauge className="h-3.5 w-3.5" />}
          label={t('metrics.peak_rps')}
          value={formatDecimalNumber(
            displayedRun.summary.peakRequestsPerSecond
          )}
          meta={t('metrics.safe_rps', {
            value: formatDecimalNumber(
              displayedRun.summary.safeRequestsPerSecond
            ),
          })}
        />
        <MetricBlock
          icon={<Activity className="h-3.5 w-3.5" />}
          label={t('metrics.p95_latency')}
          value={formatLatencyMs(displayedRun.summary.latency.p95Ms)}
          meta={t('metrics.error_rate', {
            value: formatPercent((displayedRun.summary.errorRate ?? 0) * 100),
          })}
        />
        <MetricBlock
          icon={<Radio className="h-3.5 w-3.5" />}
          label={t('metrics.cpu_peak')}
          value={formatPercent(cpuSpike?.peak)}
          meta={t('metrics.cpu_delta', {
            value: formatPercent(cpuSpike?.delta),
          })}
        />
        <MetricBlock
          icon={<HardDrive className="h-3.5 w-3.5" />}
          label={t('metrics.memory_peak')}
          value={formatBytes(memorySpike?.peak)}
          meta={t('metrics.memory_delta', {
            value: formatBytes(memorySpike?.delta),
          })}
        />
      </div>

      {displayedRun.summary.capacityJudgement ||
      displayedRun.summary.failureMode ? (
        <div className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
          <div className="font-medium">
            {displayedRun.summary.capacityJudgement ??
              displayedRun.summary.failureMode}
          </div>
          {displayedRun.summary.saturationPoint ? (
            <div className="mt-1 text-muted-foreground">
              {displayedRun.summary.saturationPoint}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
