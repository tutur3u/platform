/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it } from 'vitest';
import { BlueGreenMonitoringAlerts } from './blue-green-monitoring-state';

const messages: Record<string, string> = {
  'alerts.mount_missing_description': 'Mount missing description',
  'alerts.mount_missing_title': 'Mount missing',
  'alerts.snapshot_missing_description': 'Snapshot missing description',
  'alerts.snapshot_missing_title': 'Waiting for watcher snapshot',
  'alerts.watcher_degraded_offline': 'Offline watcher description',
  'alerts.watcher_degraded_stale': 'Stale watcher description',
  'alerts.watcher_degraded_title': 'Watcher needs attention',
};

function t(key: string) {
  return messages[key] ?? key;
}

function createSnapshot(
  source: BlueGreenMonitoringSnapshot['source'],
  watcherHealth: BlueGreenMonitoringSnapshot['watcher']['health'],
  deployments: BlueGreenMonitoringSnapshot['deployments'] = []
) {
  return {
    deployments,
    source,
    watcher: {
      health: watcherHealth,
    },
  } as BlueGreenMonitoringSnapshot;
}

describe('BlueGreenMonitoringAlerts', () => {
  it('does not show a duplicate watcher warning while waiting for the first status snapshot', () => {
    render(
      <BlueGreenMonitoringAlerts
        snapshot={createSnapshot(
          {
            historyAvailable: true,
            monitoringDirAvailable: true,
            statusAvailable: false,
          },
          'offline'
        )}
        t={t as never}
      />
    );

    expect(
      screen.getByText('Waiting for watcher snapshot')
    ).toBeInTheDocument();
    expect(screen.queryByText('Watcher needs attention')).toBeNull();
  });

  it('shows watcher health only when a status snapshot exists', () => {
    render(
      <BlueGreenMonitoringAlerts
        snapshot={createSnapshot(
          {
            historyAvailable: true,
            monitoringDirAvailable: true,
            statusAvailable: true,
          },
          'stale'
        )}
        t={t as never}
      />
    );

    expect(screen.getByText('Watcher needs attention')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for watcher snapshot')).toBeNull();
  });

  it('does not show a stale watcher warning while a rollout is in progress', () => {
    render(
      <BlueGreenMonitoringAlerts
        snapshot={createSnapshot(
          {
            historyAvailable: true,
            monitoringDirAvailable: true,
            statusAvailable: true,
          },
          'stale',
          [
            {
              commitHash: 'deploying-commit',
              commitShortHash: 'deploying',
              runtimeState: null,
              startedAt: 2000,
              status: 'building',
            },
          ] as BlueGreenMonitoringSnapshot['deployments']
        )}
        t={t as never}
      />
    );

    expect(screen.queryByText('Watcher needs attention')).toBeNull();
  });
});
