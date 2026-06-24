'use client';

import type { BlueGreenMonitoringWatcherLog } from '@tuturuuu/internal-api/infrastructure/monitoring';

export type WatcherLogFilters = {
  deploymentStatus: string;
  level: string;
  query: string;
  scope: string;
};

export type WatcherLogOption = {
  label: string;
  value: string;
};

const STATUS_TRANSLATION_KEYS: Record<string, string> = {
  active: 'deployment_status.active',
  building: 'deployment_status.building',
  canceled: 'deployment_status.canceled',
  cancelled: 'deployment_status.canceled',
  deploying: 'deployment_status.deploying',
  ended: 'deployment_status.ended',
  failed: 'deployment_status.failed',
  success: 'deployment_status.successful',
  successful: 'deployment_status.successful',
  unknown: 'deployment_status.unknown',
  'up-to-date': 'deployment_status.successful',
};

export function getDeploymentStatusTranslationKey(
  status: string | null
): string {
  return (
    STATUS_TRANSLATION_KEYS[status ?? 'unknown'] ??
    STATUS_TRANSLATION_KEYS.unknown ??
    'deployment_status.unknown'
  );
}

export function getWatcherLogKey(
  log: BlueGreenMonitoringWatcherLog,
  index: number
) {
  return [
    log.eventId,
    log.incidentId,
    log.time,
    log.level,
    log.deploymentKey,
    log.message,
    index,
  ]
    .filter((part) => part != null && part !== '')
    .join(':');
}

export function getWatcherLogDeploymentLabel(
  log: BlueGreenMonitoringWatcherLog,
  fallback: string
) {
  return (
    log.commitShortHash ??
    log.deploymentStamp ??
    log.deploymentKey ??
    log.activeColor ??
    fallback
  );
}

function getWatcherLogScopeValue(log: BlueGreenMonitoringWatcherLog) {
  return (
    log.deploymentKey ??
    (log.deploymentStamp ? `stamp:${log.deploymentStamp}` : null) ??
    (log.commitHash ? `commit:${log.commitHash}` : null) ??
    (log.activeColor ? `color:${log.activeColor}` : null)
  );
}

export function getWatcherLogScopeOptions(
  logs: BlueGreenMonitoringWatcherLog[],
  allLabel: string,
  fallbackLabel: string
) {
  const options = new Map<string, string>();

  for (const log of logs) {
    const value = getWatcherLogScopeValue(log);

    if (value) {
      options.set(value, getWatcherLogDeploymentLabel(log, fallbackLabel));
    }
  }

  return [
    { label: allLabel, value: 'all' },
    ...Array.from(options.entries())
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([value, label]) => ({ label, value })),
  ];
}

export function getWatcherLogLevelOptions(
  logs: BlueGreenMonitoringWatcherLog[],
  allLabel: string
) {
  return [
    { label: allLabel, value: 'all' },
    ...Array.from(new Set(logs.map((log) => log.level)))
      .filter(Boolean)
      .sort()
      .map((level) => ({
        label: level.toUpperCase(),
        value: level,
      })),
  ];
}

export function getWatcherLogStatusOptions({
  allLabel,
  logs,
  translateStatus,
}: {
  allLabel: string;
  logs: BlueGreenMonitoringWatcherLog[];
  translateStatus: (status: string) => string;
}) {
  return [
    { label: allLabel, value: 'all' },
    ...Array.from(new Set(logs.map((log) => log.deploymentStatus ?? 'unknown')))
      .sort()
      .map((status) => ({
        label: translateStatus(status),
        value: status,
      })),
  ];
}

export function filterWatcherLogs(
  logs: BlueGreenMonitoringWatcherLog[],
  filters: WatcherLogFilters
) {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return logs.filter((log) => {
    if (
      filters.scope !== 'all' &&
      getWatcherLogScopeValue(log) !== filters.scope
    ) {
      return false;
    }

    if (filters.level !== 'all' && log.level !== filters.level) {
      return false;
    }

    if (
      filters.deploymentStatus !== 'all' &&
      (log.deploymentStatus ?? 'unknown') !== filters.deploymentStatus
    ) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchFields = [
      log.activeColor,
      log.commitHash,
      log.commitShortHash,
      log.deploymentKey,
      log.deploymentKind,
      log.deploymentStamp,
      log.deploymentStatus,
      log.eventId,
      log.eventType,
      log.incidentId,
      log.level,
      log.message,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return searchFields.some((value) => value.includes(normalizedQuery));
  });
}
