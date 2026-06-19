import type { BlueGreenMonitoringDockerContainer } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { formatCompactNumber } from './formatters';

export type ResourceTone =
  | 'amber'
  | 'blue'
  | 'green'
  | 'muted'
  | 'orange'
  | 'red';

export const resourceToneClasses: Record<
  ResourceTone,
  { bar: string; dot: string; soft: string; text: string }
> = {
  amber: {
    bar: 'bg-dynamic-yellow',
    dot: 'bg-dynamic-yellow',
    soft: 'border-dynamic-yellow/30 bg-dynamic-yellow/10',
    text: 'text-dynamic-yellow',
  },
  blue: {
    bar: 'bg-dynamic-blue',
    dot: 'bg-dynamic-blue',
    soft: 'border-dynamic-blue/30 bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
  },
  green: {
    bar: 'bg-dynamic-green',
    dot: 'bg-dynamic-green',
    soft: 'border-dynamic-green/30 bg-dynamic-green/10',
    text: 'text-dynamic-green',
  },
  muted: {
    bar: 'bg-muted-foreground',
    dot: 'bg-muted-foreground',
    soft: 'border-border bg-muted/30',
    text: 'text-muted-foreground',
  },
  orange: {
    bar: 'bg-dynamic-orange',
    dot: 'bg-dynamic-orange',
    soft: 'border-dynamic-orange/30 bg-dynamic-orange/10',
    text: 'text-dynamic-orange',
  },
  red: {
    bar: 'bg-dynamic-red',
    dot: 'bg-dynamic-red',
    soft: 'border-dynamic-red/30 bg-dynamic-red/10',
    text: 'text-dynamic-red',
  },
};

export interface ResourceSummary {
  healthyCount: number;
  serviceCount: number;
  totalCpuPercent: number;
  totalMemoryBytes: number;
  totalRxBytes: number;
  totalTxBytes: number;
}

export interface ResourceCluster {
  containers: BlueGreenMonitoringDockerContainer[];
  id: string;
  source: 'detected' | 'project' | 'unknown';
  summary: ResourceSummary;
}

export function groupContainers(
  containers: BlueGreenMonitoringDockerContainer[]
) {
  const grouped = new Map<
    string,
    {
      containers: BlueGreenMonitoringDockerContainer[];
      source: ResourceCluster['source'];
    }
  >();

  for (const container of containers) {
    const cluster = getParentCluster(container);
    const current = grouped.get(cluster.id) ?? {
      containers: [],
      source: cluster.source,
    };
    current.containers.push(container);
    grouped.set(cluster.id, current);
  }

  return Array.from(grouped.entries())
    .map(([id, value]) => ({
      containers: value.containers.sort((a, b) =>
        getContainerDisplayName(a, id).localeCompare(
          getContainerDisplayName(b, id)
        )
      ),
      id,
      source: value.source,
      summary: summarizeContainers(value.containers),
    }))
    .sort((a, b) => b.summary.totalMemoryBytes - a.summary.totalMemoryBytes);
}

export function getContainerDisplayName(
  container: BlueGreenMonitoringDockerContainer,
  clusterId: string
) {
  const name = container.name || container.serviceName || container.containerId;
  const prefix = `${clusterId}-`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

export function summarizeContainers(
  containers: BlueGreenMonitoringDockerContainer[]
): ResourceSummary {
  return {
    healthyCount: containers.filter(
      (container) => container.health === 'healthy'
    ).length,
    serviceCount: containers.length,
    totalCpuPercent: containers.reduce(
      (total, container) => total + (container.cpuPercent ?? 0),
      0
    ),
    totalMemoryBytes: containers.reduce(
      (total, container) => total + (container.memoryBytes ?? 0),
      0
    ),
    totalRxBytes: containers.reduce(
      (total, container) => total + (container.rxBytes ?? 0),
      0
    ),
    totalTxBytes: containers.reduce(
      (total, container) => total + (container.txBytes ?? 0),
      0
    ),
  };
}

export function getPercent(value: number | null | undefined, max: number) {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(2, Math.min(100, (value / max) * 100));
}

export function getCpuTone(value: number | null | undefined): ResourceTone {
  if (value == null || !Number.isFinite(value)) return 'muted';
  if (value < 5) return 'green';
  if (value <= 20) return 'amber';
  if (value <= 40) return 'orange';
  return 'red';
}

export function getMemoryTone(value: number | null | undefined): ResourceTone {
  if (value == null || !Number.isFinite(value)) return 'muted';

  const mb = value / 1024 / 1024;
  if (mb < 200) return 'green';
  if (mb <= 500) return 'amber';
  if (mb <= 1024) return 'orange';
  return 'red';
}

export function getClusterTone(
  summary: ResourceSummary,
  containers?: BlueGreenMonitoringDockerContainer[]
): ResourceTone {
  if (summary.serviceCount === 0) return 'muted';

  if (containers?.some((container) => container.health === 'unhealthy')) {
    return 'red';
  }

  if (summary.healthyCount === summary.serviceCount) {
    return 'green';
  }

  return 'orange';
}

export function formatResourceNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  return formatCompactNumber(value).toLowerCase();
}

function getParentCluster(container: BlueGreenMonitoringDockerContainer): {
  id: string;
  source: ResourceCluster['source'];
} {
  if (container.projectName?.trim()) {
    return { id: container.projectName.trim(), source: 'project' };
  }

  const candidate = [container.name, container.serviceName]
    .filter(Boolean)
    .map(String)
    .find((value) => value.includes('-'));

  if (!candidate) {
    return { id: 'ungrouped', source: 'unknown' };
  }

  return { id: candidate.split('-')[0] ?? 'ungrouped', source: 'detected' };
}
