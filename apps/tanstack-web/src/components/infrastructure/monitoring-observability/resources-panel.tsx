'use client';

import type { ObservabilityResources } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import {
  formatBytes,
  formatCompactNumber,
  formatDateTime,
  formatPercent,
} from './formatters';
import {
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  MiniBars,
} from './primitives';
import type { MonitoringTone, MonitoringTranslator } from './types';

function cpuTone(value: number | null | undefined): MonitoringTone {
  if (value == null) return 'muted';
  if (value >= 85) return 'red';
  if (value >= 65) return 'orange';
  return 'green';
}

export function ResourcesPanel({
  data,
  isLoading,
  onTimeframeHoursChange,
  scopedContainers,
  t,
  timeframeHours,
}: {
  data: ObservabilityResources | undefined;
  isLoading: boolean;
  onTimeframeHoursChange: (value: number) => void;
  scopedContainers: ObservabilityResources['dockerResources']['allContainers'];
  t: MonitoringTranslator;
  timeframeHours: number;
}) {
  const resources = data?.dockerResources;
  const buildResources = data?.buildResources;
  const runtimeRows = (data?.buckets ?? []).slice(-16).map((bucket) => ({
    label: formatDateTime(bucket.bucketStart),
    tone: cpuTone(bucket.cpuPercent),
    value: Math.round(bucket.cpuPercent ?? 0),
  }));
  const memoryRows = (data?.buckets ?? []).slice(-16).map((bucket) => ({
    label: formatDateTime(bucket.bucketStart),
    tone: 'blue' as const,
    value: Math.round((bucket.memoryBytes ?? 0) / 1024 / 1024),
  }));
  const timeframeOptions = [
    [1, t('last_hour')],
    [6, t('last_6_hours')],
    [12, t('last_12_hours')],
    [24, t('last_24_hours')],
    [72, t('last_3_days')],
    [168, t('last_7_days')],
  ] as const;

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium text-sm">
            {t('resources.resource_history')}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('resources.resource_history_meta')}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {timeframeOptions.map(([value, label]) => (
            <Button
              className={cn(
                timeframeHours === value &&
                  'border-dynamic-blue/60 bg-dynamic-blue/10 text-dynamic-blue'
              )}
              key={value}
              onClick={() => onTimeframeHoursChange(value)}
              size="sm"
              type="button"
              variant="outline"
            >
              {label}
            </Button>
          ))}
        </div>
      </section>
      <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
        <MetricCard
          label={t('resources.total_cpu')}
          value={formatPercent(resources?.totalCpuPercent)}
        />
        <MetricCard
          label={t('resources.total_memory')}
          value={formatBytes(resources?.totalMemoryBytes)}
        />
        <MetricCard
          label={t('resources.build_resources')}
          value={formatBytes(buildResources?.totalMemoryBytes)}
        />
        <MetricCard
          label={t('resources.services')}
          value={formatCompactNumber(scopedContainers.length)}
        />
      </section>
      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <MiniBars
            emptyLabel={t('charts.no_data')}
            rows={runtimeRows}
            title={t('resources.cpu_trend')}
          />
          <MiniBars
            emptyLabel={t('charts.no_data')}
            rows={memoryRows}
            title={t('resources.memory_trend')}
          />
        </div>
      )}
      <section className="rounded-lg border border-border bg-background">
        <div className="border-border border-b px-4 py-3">
          <p className="font-medium text-sm">{t('resources.live_inventory')}</p>
          <p className="text-muted-foreground text-xs">
            {t('resources.live_inventory_meta')}
          </p>
        </div>
        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : scopedContainers.length === 0 ? (
          <EmptyState label={t('empty.containers')} />
        ) : (
          <div className="divide-y divide-border/60">
            {scopedContainers.map((container) => (
              <div
                className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_120px_140px_140px]"
                key={container.containerId}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {container.serviceName ?? container.name}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {container.image ?? container.name}
                  </p>
                </div>
                <MetricText
                  label={t('resources.cpu')}
                  value={formatPercent(container.cpuPercent)}
                />
                <MetricText
                  label={t('resources.memory')}
                  value={formatBytes(container.memoryBytes)}
                />
                <MetricText
                  label={t('resources.network')}
                  value={`${formatBytes(container.rxBytes)} / ${formatBytes(
                    container.txBytes
                  )}`}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate font-mono">{value}</p>
    </div>
  );
}
