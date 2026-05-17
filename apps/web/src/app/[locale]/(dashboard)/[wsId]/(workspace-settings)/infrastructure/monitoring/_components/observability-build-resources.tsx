'use client';

import { Gauge, Terminal } from '@tuturuuu/icons';
import type { ObservabilityBuildResources as ObservabilityBuildResourcesPayload } from '@tuturuuu/internal-api/infrastructure';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  formatBytes,
  formatDuration,
  getDeploymentStatusTranslationKey,
} from './formatters';
import {
  formatResourceNumber,
  getContainerDisplayName,
  getCpuTone,
  getMemoryTone,
  getPercent,
  type ResourceTone,
  resourceToneClasses,
} from './observability-resource-clusters.utils';

export function ObservabilityBuildResources({
  buildResources,
  isLoading,
}: {
  buildResources: ObservabilityBuildResourcesPayload | undefined;
  isLoading: boolean;
}) {
  const t = useTranslations('blue-green-monitoring.observability');
  const rootT = useTranslations('blue-green-monitoring');
  const activeBuilds = buildResources?.activeBuilds ?? [];
  const containers = buildResources?.containers ?? [];
  const activeBuildRows = containers.length > 0 ? [] : activeBuilds;
  const processCount =
    containers.length > 0 ? containers.length : activeBuilds.length;
  const hasBuildActivity = activeBuildRows.length > 0 || containers.length > 0;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-3 border-border border-b bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
            <Gauge className="h-4 w-4" />
            <span>{t('resources.build_resources')}</span>
          </div>
          <h3 className="mt-2 font-semibold text-base">
            {t('resources.docker_build_consumption')}
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('resources.docker_build_consumption_meta')}
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-muted-foreground text-xs">
          <Terminal className="h-3.5 w-3.5" />
          <span>{buildResources?.state ?? 'idle'}</span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              className="h-20 animate-pulse rounded-md bg-muted"
              key={index}
            />
          ))
        ) : (
          <>
            <BuildSummaryMetric
              label={t('resources.total_cpu')}
              tone={getCpuTone(buildResources?.totalCpuPercent)}
              value={`${formatResourceNumber(buildResources?.totalCpuPercent)}%`}
            />
            <BuildSummaryMetric
              label={t('resources.total_memory')}
              tone={getMemoryTone(buildResources?.totalMemoryBytes)}
              value={formatBytes(buildResources?.totalMemoryBytes)}
            />
            <BuildSummaryMetric
              label={t('resources.network')}
              tone="blue"
              value={`${formatBytes(buildResources?.totalRxBytes)} / ${formatBytes(buildResources?.totalTxBytes)}`}
            />
            <BuildSummaryMetric
              label={t('resources.build_processes')}
              tone={processCount > 0 ? 'green' : 'muted'}
              value={formatResourceNumber(processCount)}
            />
          </>
        )}
      </div>

      {isLoading ? null : hasBuildActivity ? (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_98px_120px_128px_132px] gap-4 border-border border-y px-4 py-3 text-muted-foreground text-xs xl:grid">
            <span>{t('resources.builder')}</span>
            <span>{t('resources.uptime')}</span>
            <span>{t('resources.cpu')}</span>
            <span>{t('resources.memory')}</span>
            <span>{t('resources.network')}</span>
          </div>
          <div className="divide-y divide-border/60">
            {activeBuildRows.map((build) => (
              <ActiveBuildRow
                build={build}
                key={build.id}
                statusLabel={rootT(
                  getDeploymentStatusTranslationKey(build.status)
                )}
              />
            ))}
            {containers.map((container) => (
              <BuildContainerRow
                container={container}
                key={container.containerId}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="border-border border-t px-4 py-8 text-center text-muted-foreground text-sm">
          {t('resources.no_build_resources')}
        </div>
      )}
    </section>
  );
}

function ActiveBuildRow({
  build,
  statusLabel,
}: {
  build: ObservabilityBuildResourcesPayload['activeBuilds'][number];
  statusLabel: string;
}) {
  const elapsedMs =
    build.startedAt == null ? null : Math.max(0, Date.now() - build.startedAt);
  const details = [
    build.deploymentKind,
    build.commitShortHash,
    statusLabel,
  ].filter(Boolean);

  return (
    <div className="grid gap-3 px-4 py-3 text-sm xl:grid-cols-[minmax(0,1fr)_98px_120px_128px_132px] xl:items-center xl:gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{build.name}</p>
        <p className="truncate font-mono text-muted-foreground text-xs">
          {details.join(' / ')}
        </p>
      </div>
      <span className="font-mono text-muted-foreground text-xs">
        {elapsedMs == null ? '-' : formatDuration(elapsedMs)}
      </span>
      <span className="font-mono text-muted-foreground text-xs">-</span>
      <span className="font-mono text-muted-foreground text-xs">-</span>
      <span className="font-mono text-muted-foreground text-xs">-</span>
    </div>
  );
}

function BuildContainerRow({
  container,
}: {
  container: ObservabilityBuildResourcesPayload['containers'][number];
}) {
  const cpuTone = getCpuTone(container.cpuPercent);
  const memoryTone = getMemoryTone(container.memoryBytes);
  const memoryMb =
    container.memoryBytes == null ? null : container.memoryBytes / 1024 / 1024;

  return (
    <div className="grid gap-3 px-4 py-3 text-sm xl:grid-cols-[minmax(0,1fr)_98px_120px_128px_132px] xl:items-center xl:gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {getContainerDisplayName(container, container.projectName ?? 'build')}
        </p>
        <p className="truncate font-mono text-muted-foreground text-xs">
          {container.image ?? container.serviceName ?? '-'}
        </p>
      </div>
      <span className="font-mono text-muted-foreground text-xs">
        {container.runningFor ?? '-'}
      </span>
      <BuildUsageBar
        max={40}
        tone={cpuTone}
        value={container.cpuPercent}
        valueLabel={`${formatResourceNumber(container.cpuPercent)}%`}
      />
      <BuildUsageBar
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

function BuildSummaryMetric({
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
          'mt-2 font-semibold text-xl',
          resourceToneClasses[tone].text
        )}
      >
        {value}
      </p>
    </div>
  );
}

function BuildUsageBar({
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
