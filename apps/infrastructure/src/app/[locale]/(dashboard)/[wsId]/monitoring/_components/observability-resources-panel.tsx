'use client';

import type { ObservabilityResources } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { formatBytes } from './formatters';
import { ObservabilityBuildResources } from './observability-build-resources';
import { ObservabilityResourceClusters } from './observability-resource-clusters';
import { SamplingContinuityPanel } from './observability-resource-sampling';
import {
  getCpuResourceTone,
  getMemoryResourceTone,
} from './observability-resource-theme';
import {
  formatResourceNumber,
  ResourceChartsLoading,
  ResourceTrendChart,
} from './observability-resource-trend-chart';

interface ObservabilityResourcesPanelProps {
  data: ObservabilityResources | undefined;
  isLoading: boolean;
  onTimeframeHoursChange: (value: number) => void;
  scopedContainers: ObservabilityResources['dockerResources']['allContainers'];
  timeframeHours: number;
}

export function ObservabilityResourcesPanel({
  data,
  isLoading,
  onTimeframeHoursChange,
  scopedContainers,
  timeframeHours,
}: ObservabilityResourcesPanelProps) {
  const t = useTranslations('blue-green-monitoring.observability');
  const resources = data?.dockerResources;
  const resourceBuckets = data?.buckets ?? [];
  const buildResourceBuckets = data?.buildBuckets ?? [];
  const buildResources = data?.buildResources;
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
            <button
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs',
                timeframeHours === value
                  ? 'border-dynamic-blue/60 bg-dynamic-blue/10 text-dynamic-blue'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
              key={value}
              onClick={() => onTimeframeHoursChange(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <SamplingContinuityPanel
        isLoading={isLoading}
        sampling={data?.sampling}
      />

      {isLoading ? (
        <ResourceChartsLoading />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <ResourceTrendChart
            buckets={resourceBuckets}
            emptyLabel={t('charts.no_data')}
            formatter={(value) => `${formatResourceNumber(value)}%`}
            samplingStripLabel={t('resources.sampling_strip_runtime')}
            series={[
              {
                getValue: (bucket) => bucket.cpuPercent,
                label: t('resources.cpu'),
                tone: getCpuResourceTone(resources?.totalCpuPercent),
              },
            ]}
            title={t('resources.cpu_trend')}
          />
          <ResourceTrendChart
            buckets={resourceBuckets}
            emptyLabel={t('charts.no_data')}
            formatter={formatBytes}
            samplingStripLabel={t('resources.sampling_strip_runtime')}
            series={[
              {
                getValue: (bucket) => bucket.memoryBytes,
                label: t('resources.memory'),
                tone: getMemoryResourceTone(resources?.totalMemoryBytes),
              },
            ]}
            title={t('resources.memory_trend')}
          />
          <ResourceTrendChart
            buckets={resourceBuckets}
            emptyLabel={t('charts.no_data')}
            formatter={formatBytes}
            samplingStripLabel={t('resources.sampling_strip_runtime')}
            series={[
              {
                getValue: (bucket) => bucket.rxBytes,
                label: t('resources.rx'),
                tone: 'blue',
              },
              {
                getValue: (bucket) => bucket.txBytes,
                label: t('resources.tx'),
                tone: 'amber',
              },
            ]}
            title={t('resources.network_trend')}
          />
        </div>
      )}

      <ObservabilityBuildResources
        buildResources={buildResources}
        isLoading={isLoading}
      />

      {isLoading ? (
        <ResourceChartsLoading />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <ResourceTrendChart
            buckets={buildResourceBuckets}
            emptyLabel={t('charts.no_data')}
            formatter={(value) => `${formatResourceNumber(value)}%`}
            samplingStripLabel={t('resources.sampling_strip_build')}
            series={[
              {
                getValue: (bucket) => bucket.cpuPercent,
                label: t('resources.cpu'),
                tone: getCpuResourceTone(buildResources?.totalCpuPercent),
              },
            ]}
            title={t('resources.build_cpu_trend')}
          />
          <ResourceTrendChart
            buckets={buildResourceBuckets}
            emptyLabel={t('charts.no_data')}
            formatter={formatBytes}
            samplingStripLabel={t('resources.sampling_strip_build')}
            series={[
              {
                getValue: (bucket) => bucket.memoryBytes,
                label: t('resources.memory'),
                tone: getMemoryResourceTone(buildResources?.totalMemoryBytes),
              },
            ]}
            title={t('resources.build_memory_trend')}
          />
          <ResourceTrendChart
            buckets={buildResourceBuckets}
            emptyLabel={t('charts.no_data')}
            formatter={formatBytes}
            samplingStripLabel={t('resources.sampling_strip_build')}
            series={[
              {
                getValue: (bucket) => bucket.rxBytes,
                label: t('resources.rx'),
                tone: 'blue',
              },
              {
                getValue: (bucket) => bucket.txBytes,
                label: t('resources.tx'),
                tone: 'amber',
              },
            ]}
            title={t('resources.build_network_trend')}
          />
        </div>
      )}

      <ObservabilityResourceClusters
        containers={scopedContainers}
        isLoading={isLoading}
      />
    </div>
  );
}
