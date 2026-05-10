'use client';

import {
  Box,
  ChevronDown,
  ChevronRight,
  Radio,
  Terminal,
} from '@tuturuuu/icons';
import type { BlueGreenMonitoringDockerContainer } from '@tuturuuu/internal-api/infrastructure';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { formatBytes } from './formatters';
import {
  formatResourceNumber,
  getClusterTone,
  getContainerDisplayName,
  getCpuTone,
  getMemoryTone,
  getPercent,
  groupContainers,
  type ResourceCluster,
  type ResourceTone,
  resourceToneClasses,
  summarizeContainers,
} from './observability-resource-clusters.utils';
import { ResourceClusterSkeleton } from './observability-resource-clusters-loading';

export function ObservabilityResourceClusters({
  containers,
  isLoading,
}: {
  containers: BlueGreenMonitoringDockerContainer[];
  isLoading: boolean;
}) {
  const t = useTranslations('blue-green-monitoring.observability');
  const [selectedCluster, setSelectedCluster] = useQueryState(
    'resourceCluster',
    parseAsString.withDefault('all')
  );
  const clusters = useMemo(() => groupContainers(containers), [containers]);
  const activeCluster =
    selectedCluster === 'all' ||
    clusters.some((cluster) => cluster.id === selectedCluster)
      ? selectedCluster
      : 'all';
  const visibleClusters =
    activeCluster === 'all'
      ? clusters
      : clusters.filter((cluster) => cluster.id === activeCluster);
  const visibleSummary = summarizeContainers(
    visibleClusters.flatMap((cluster) => cluster.containers)
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
                <Box className="h-4 w-4" />
                <span>{t('resources.cluster_filter')}</span>
              </div>
              <h3 className="mt-2 font-semibold text-base">
                {t('resources.live_inventory')}
              </h3>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('resources.live_inventory_meta')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ClusterFilterButton
                active={activeCluster === 'all'}
                count={containers.length}
                label={t('resources.all_clusters')}
                onClick={() => void setSelectedCluster('all')}
              />
              {clusters.map((cluster) => (
                <ClusterFilterButton
                  active={activeCluster === cluster.id}
                  count={cluster.containers.length}
                  key={cluster.id}
                  label={cluster.id}
                  onClick={() => void setSelectedCluster(cluster.id)}
                />
              ))}
            </div>
          </div>
        </section>

        {isLoading ? (
          <ResourceClusterSkeleton />
        ) : visibleClusters.length > 0 ? (
          visibleClusters.map((cluster) => (
            <ResourceClusterCard cluster={cluster} key={cluster.id} />
          ))
        ) : (
          <section className="rounded-lg border border-border bg-background px-4 py-12 text-center text-muted-foreground text-sm">
            {t('resources.no_clusters')}
          </section>
        )}
      </div>

      <section className="h-fit rounded-lg border border-border bg-background p-4">
        <Terminal className="mb-3 h-4 w-4 text-muted-foreground" />
        <p className="font-medium text-sm">{t('resources.cluster_summary')}</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {activeCluster === 'all'
            ? t('resources.cluster_filter_meta')
            : activeCluster}
        </p>
        {isLoading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                className="h-16 animate-pulse rounded-md bg-muted"
                key={index}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <SummaryMetric
              label={t('resources.total_cpu')}
              tone={getCpuTone(visibleSummary.totalCpuPercent)}
              value={`${formatResourceNumber(visibleSummary.totalCpuPercent)}%`}
            />
            <SummaryMetric
              label={t('resources.total_memory')}
              tone={getMemoryTone(visibleSummary.totalMemoryBytes)}
              value={formatBytes(visibleSummary.totalMemoryBytes)}
            />
            <SummaryMetric
              label={t('resources.network')}
              tone="blue"
              value={`${formatBytes(visibleSummary.totalRxBytes)} / ${formatBytes(visibleSummary.totalTxBytes)}`}
            />
            <SummaryMetric
              label={t('resources.services')}
              tone="muted"
              value={formatResourceNumber(visibleSummary.serviceCount)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ResourceClusterCard({ cluster }: { cluster: ResourceCluster }) {
  const t = useTranslations('blue-green-monitoring.observability');
  const clusterTone = getClusterTone(cluster.summary, cluster.containers);
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-4 border-border border-b bg-muted/20 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <button
            className="flex w-full flex-wrap items-center gap-2 text-left"
            onClick={() => setIsExpanded((current) => !current)}
            type="button"
          >
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                resourceToneClasses[clusterTone].dot
              )}
            />
            <span className="truncate font-semibold text-base">
              {cluster.id}
            </span>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground text-xs">
              {cluster.source === 'project'
                ? t('resources.compose_project')
                : cluster.source === 'detected'
                  ? t('resources.detected_prefix')
                  : t('resources.no_cluster')}
            </span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('resources.cluster_count', {
              count: cluster.summary.serviceCount,
            })}
          </p>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2 xl:min-w-140 xl:grid-cols-4">
          <SummaryPill
            label={t('resources.cpu')}
            tone={getCpuTone(cluster.summary.totalCpuPercent)}
            value={`${formatResourceNumber(cluster.summary.totalCpuPercent)}%`}
          />
          <SummaryPill
            label={t('resources.memory')}
            tone={getMemoryTone(cluster.summary.totalMemoryBytes)}
            value={formatBytes(cluster.summary.totalMemoryBytes)}
          />
          <SummaryPill
            label={t('resources.network')}
            tone="blue"
            value={`${formatBytes(cluster.summary.totalRxBytes)} / ${formatBytes(cluster.summary.totalTxBytes)}`}
          />
          <SummaryPill
            label={t('resources.health')}
            tone={clusterTone}
            value={`${cluster.summary.healthyCount}/${cluster.summary.serviceCount}`}
          />
        </div>
      </div>

      {isExpanded ? (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_88px_98px_120px_128px_132px] gap-4 border-border border-b px-4 py-3 text-muted-foreground text-xs xl:grid">
            <span>{t('resources.container')}</span>
            <span>{t('resources.health')}</span>
            <span>{t('resources.uptime')}</span>
            <span>{t('resources.cpu')}</span>
            <span>{t('resources.memory')}</span>
            <span>{t('resources.network')}</span>
          </div>
          <div className="divide-y divide-border/60">
            {cluster.containers.map((container) => (
              <ContainerRow
                clusterId={cluster.id}
                container={container}
                key={container.containerId}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function ContainerRow({
  clusterId,
  container,
}: {
  clusterId: string;
  container: BlueGreenMonitoringDockerContainer;
}) {
  const cpuTone = getCpuTone(container.cpuPercent);
  const memoryTone = getMemoryTone(container.memoryBytes);
  const memoryMb =
    container.memoryBytes == null ? null : container.memoryBytes / 1024 / 1024;

  return (
    <div className="grid gap-3 px-4 py-3 text-sm xl:grid-cols-[minmax(0,1fr)_88px_98px_120px_128px_132px] xl:items-center xl:gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {getContainerDisplayName(container, clusterId)}
        </p>
        <p className="truncate font-mono text-muted-foreground text-xs">
          {container.image ?? container.serviceName ?? '-'}
        </p>
      </div>
      <HealthValue health={container.health} />
      <span className="font-mono text-muted-foreground text-xs">
        {container.runningFor ?? '-'}
      </span>
      <UsageBar
        max={40}
        tone={cpuTone}
        value={container.cpuPercent}
        valueLabel={`${formatResourceNumber(container.cpuPercent)}%`}
      />
      <UsageBar
        max={1024}
        tone={memoryTone}
        value={memoryMb}
        valueLabel={formatBytes(container.memoryBytes)}
      />
      <span className="font-mono text-muted-foreground text-xs">
        {formatBytes(container.rxBytes)} / {formatBytes(container.txBytes)}
      </span>
    </div>
  );
}

function ClusterFilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
        active
          ? 'border-dynamic-blue/60 bg-dynamic-blue/10 text-dynamic-blue'
          : 'border-border bg-background text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      <Radio className="h-3.5 w-3.5" />
      <span className="max-w-36 truncate">{label}</span>
      <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        {formatResourceNumber(count)}
      </span>
    </button>
  );
}

function SummaryMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: ResourceTone;
  value: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-4 py-3',
        resourceToneClasses[tone].soft
      )}
    >
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'mt-2 font-semibold text-2xl',
          resourceToneClasses[tone].text
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SummaryPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: ResourceTone;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate font-medium font-mono',
          resourceToneClasses[tone].text
        )}
      >
        {value}
      </p>
    </div>
  );
}

function UsageBar({
  max,
  tone,
  value,
  valueLabel,
}: {
  max: number;
  tone: ResourceTone;
  value: number | null | undefined;
  valueLabel: string;
}) {
  return (
    <div>
      <span className={cn('font-medium', resourceToneClasses[tone].text)}>
        {valueLabel}
      </span>
      <div className="mt-1 h-1 rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', resourceToneClasses[tone].bar)}
          style={{ width: `${getPercent(value, max)}%` }}
        />
      </div>
    </div>
  );
}

function HealthValue({
  health,
}: {
  health: BlueGreenMonitoringDockerContainer['health'];
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full border px-2 py-0.5 font-medium text-xs',
        health === 'healthy'
          ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
          : health === 'unhealthy'
            ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
            : 'border-border bg-muted/30 text-muted-foreground'
      )}
    >
      {health}
    </span>
  );
}
