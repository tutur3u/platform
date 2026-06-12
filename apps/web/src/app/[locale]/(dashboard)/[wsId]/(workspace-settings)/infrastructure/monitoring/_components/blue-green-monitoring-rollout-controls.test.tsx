/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueGreenMonitoringRolloutControls } from './blue-green-monitoring-rollout-controls';

const mocks = vi.hoisted(() => ({
  requestBlueGreenInstantRollout: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/infrastructure', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@tuturuuu/internal-api/infrastructure')
    >();

  return {
    ...actual,
    clearBlueGreenDeploymentPin: vi.fn(),
    pinBlueGreenDeployment: vi.fn(),
    requestBlueGreenInstantRollout: mocks.requestBlueGreenInstantRollout,
  };
});

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const messages: Record<string, string> = {
  'controls.active_commit_chip': 'Live {commit}',
  'controls.already_synced': 'Blue and green already point at the same commit.',
  'controls.badge': 'Instant Rollout',
  'controls.clear_pin_action': 'Remove Pin',
  'controls.description':
    'Queue an immediate standby rebuild so blue and green converge on the same revision without waiting for the 15-minute refresh window.',
  'controls.instant_rollout': 'Immediate standby sync',
  'controls.live_lane': 'Live Lane',
  'controls.pin_action': 'Pin Deployment',
  'controls.pin_description':
    'Choose any successful retained deployment to roll production back and keep it there until you remove the pin.',
  'controls.pin_select_placeholder': 'Select a deployment',
  'controls.pin_title': 'Rollback and pin production',
  'controls.ready_hint':
    'The watcher is live. Trigger a standby rebuild now to make the warm backup match the live commit immediately.',
  'controls.recovery_cache_empty':
    'No cached recovery images are retained yet.',
  'controls.recovery_cache_select': 'Select cached deployment',
  'controls.recovery_cache_title': 'Cached recoverable builds',
  'controls.standby_commit_chip': 'Standby {commit}',
  'controls.standby_lane': 'Standby Lane',
  'controls.sync_action': 'Sync Standby Now',
  'controls.sync_building': 'Building Standby',
  'controls.sync_building_hint':
    'The watcher is rebuilding the standby color. This control will unlock after the refresh finishes.',
  'controls.sync_pending': 'Queueing Sync',
  'controls.sync_queued': 'Sync Queued',
  'controls.sync_queued_hint':
    'Queued at {time}. The watcher will pick up the standby rebuild on its next polling cycle.',
  'controls.sync_success': 'Queued the standby sync request.',
  'controls.title': 'Sync both colors to the same commit',
  'controls.unavailable_hint':
    'This control is available only while the watcher is live and an active color is serving traffic.',
  'states.none': 'None',
  'watcher_health.live': 'Live',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const template = messages[key] ?? key;

    return Object.entries(values ?? {}).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, replacement),
      template
    );
  },
}));

type SnapshotOverrides = Partial<
  Omit<BlueGreenMonitoringSnapshot, 'control'>
> & {
  control?: Partial<BlueGreenMonitoringSnapshot['control']>;
};

function createSnapshot(overrides: SnapshotOverrides = {}) {
  const snapshot: BlueGreenMonitoringSnapshot = {
    analytics: {
      current: {
        daily: null,
        monthly: null,
        weekly: null,
        yearly: null,
      },
      recentRequests: [],
      totalPersistedLogs: 0,
      trends: {
        daily: [],
        monthly: [],
        weekly: [],
        yearly: [],
      },
    },
    buildCache: {
      current: {},
      history: [],
      total: 0,
    },
    control: {
      deploymentRevertRequest: null,
      deploymentPin: null,
      dockerRecoverySettings: {
        dockerRecoveryPollMs: 5000,
        dockerRecoveryTimeoutMs: null,
        dockerRestartAfterMs: 30_000,
        dockerRestartCommand: null,
        dockerRestartCooldownMs: 300_000,
        dockerRestartDisabled: false,
        emailAlertCooldownMs: 1_800_000,
        emailAlertRecipients: [],
        emailAlertsEnabled: false,
        kind: 'docker-recovery-settings',
        postRestartCommandTimeoutMs: 600_000,
        postRestartCommands: [],
        updatedAt: null,
        updatedBy: null,
        updatedByEmail: null,
      },
      instantRolloutRequest: null,
    },
    dockerResources: {
      allContainers: [],
      containers: [],
      message: null,
      serviceHealth: [],
      state: 'healthy',
      totalCpuPercent: 0,
      totalMemoryBytes: 0,
      totalRxBytes: 0,
      totalTxBytes: 0,
    },
    deployments: [
      {
        commitHash: 'live-commit',
        commitShortHash: 'live',
        commitSubject: 'Live revision',
        runtimeState: 'active',
        startedAt: 2000,
        status: 'successful',
      },
      {
        commitHash: 'standby-commit',
        commitShortHash: 'standby',
        commitSubject: 'Standby revision',
        runtimeState: 'standby',
        startedAt: 1000,
        status: 'successful',
      },
    ],
    runtime: {
      activatedAt: null,
      activeColor: 'blue',
      averageRequestsPerMinute: null,
      dailyAverageRequests: null,
      dailyPeakRequests: null,
      dailyRequestCount: null,
      deploymentStamp: null,
      lifetimeMs: null,
      liveColors: ['blue', 'green'],
      peakRequestsPerMinute: null,
      requestCount: null,
      serviceContainers: {},
      standbyColor: 'green',
      state: 'serving',
      targets: {
        hive: {
          activeColor: null,
          commitHash: null,
          commitShortHash: null,
          deploymentStamp: null,
          health: 'unknown',
          lastPromotedAt: null,
          standbyColor: null,
        },
        web: {
          activeColor: 'blue',
          commitHash: 'live-commit',
          commitShortHash: 'live',
          deploymentStamp: null,
          health: 'healthy',
          lastPromotedAt: null,
          standbyColor: 'green',
        },
      },
    },
    overview: {
      averageBuildDurationMs: null,
      currentAverageRequestsPerMinute: null,
      currentPeakRequestsPerMinute: null,
      currentRequestCount: null,
      failedDeployments: 0,
      successfulDeployments: 0,
      totalDeployments: 0,
      totalPersistedLogs: 0,
      totalRequestsServed: 0,
    },
    recoveryCache: {
      deployments: [],
      limit: 5,
      total: 0,
    },
    source: {
      historyAvailable: true,
      monitoringDirAvailable: true,
      statusAvailable: true,
    },
    watcher: {
      args: [],
      events: [],
      health: 'live',
      intervalMs: 60_000,
      lastCheckAt: null,
      lastDeployAt: null,
      lastDeployStatus: null,
      lastResult: null,
      latestCommit: null,
      lock: null,
      logs: [],
      nextCheckAt: null,
      status: 'healthy',
      target: null,
      updatedAt: 2000,
    },
  };

  return {
    ...snapshot,
    ...overrides,
    control: {
      ...snapshot.control,
      ...overrides.control,
    },
  };
}

function renderControls(snapshot: BlueGreenMonitoringSnapshot) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BlueGreenMonitoringRolloutControls snapshot={snapshot} />
    </QueryClientProvider>
  );
}

describe('BlueGreenMonitoringRolloutControls', () => {
  beforeEach(() => {
    mocks.requestBlueGreenInstantRollout.mockReset();
  });

  it('disables sync while an instant rollout request is queued', () => {
    renderControls(
      createSnapshot({
        control: {
          deploymentPin: null,
          instantRolloutRequest: {
            kind: 'sync-standby',
            requestedAt: '2026-04-25T06:00:00.000Z',
            requestedBy: 'user-1',
            requestedByEmail: null,
          },
        },
      })
    );

    const syncButton = screen.getByRole('button', { name: /Sync Queued/i });

    expect(syncButton).toBeDisabled();
    expect(screen.getAllByText('Sync Queued')).toHaveLength(2);
    expect(
      screen.getByText(/The watcher will pick up the standby rebuild/i)
    ).toBeInTheDocument();
  });

  it('disables sync while the latest standby refresh is building', () => {
    renderControls(
      createSnapshot({
        deployments: [
          {
            commitHash: 'building-standby',
            commitShortHash: 'building',
            commitSubject: 'Rebuild standby',
            deploymentKind: 'standby-refresh',
            runtimeState: 'standby',
            startedAt: 3000,
            status: 'building',
          },
          {
            commitHash: 'live-commit',
            commitShortHash: 'live',
            runtimeState: 'active',
            startedAt: 2000,
            status: 'successful',
          },
        ],
      })
    );

    const syncButton = screen.getByRole('button', {
      name: /Building Standby/i,
    });

    expect(syncButton).toBeDisabled();
    expect(screen.getAllByText('Building Standby')).toHaveLength(2);
    expect(
      screen.getByText(/rebuilding the standby color/i)
    ).toBeInTheDocument();
  });

  it('locks the sync button after queueing succeeds locally', async () => {
    mocks.requestBlueGreenInstantRollout.mockResolvedValueOnce({
      request: {
        kind: 'sync-standby',
        requestedAt: '2026-04-25T06:00:00.000Z',
        requestedBy: 'user-1',
        requestedByEmail: null,
      },
    });
    renderControls(createSnapshot());

    fireEvent.click(screen.getByRole('button', { name: /Sync Standby Now/i }));

    await waitFor(() => {
      expect(mocks.requestBlueGreenInstantRollout).toHaveBeenCalledTimes(1);
    });

    const syncButton = await screen.findByRole('button', {
      name: /Sync Queued/i,
    });

    expect(syncButton).toBeDisabled();
  });

  it('shows cached recoverable deployments and lets operators select one for pinning', () => {
    renderControls(
      createSnapshot({
        recoveryCache: {
          deployments: [
            {
              commitHash: 'cached-commit',
              commitShortHash: 'cached',
              commitSubject: 'Cached rollback target',
              finishedAt: 4000,
              imageTag: 'platform-web-cache:cached',
              status: 'successful',
            },
          ],
          limit: 3,
          total: 1,
        },
      })
    );

    expect(screen.getByText('Cached recoverable builds')).toBeInTheDocument();
    expect(screen.getByText('platform-web-cache:cached')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Select cached deployment/i })
    );

    expect(screen.getByText(/cached Cached rollback target/i)).toBeVisible();
  });

  it('allows sync when the active color is live but standby is missing', async () => {
    mocks.requestBlueGreenInstantRollout.mockResolvedValueOnce({
      request: {
        kind: 'sync-standby',
        requestedAt: '2026-04-25T06:00:00.000Z',
        requestedBy: 'user-1',
        requestedByEmail: null,
      },
    });
    renderControls(
      createSnapshot({
        deployments: [
          {
            commitHash: 'live-commit',
            commitShortHash: 'live',
            commitSubject: 'Live revision',
            runtimeState: 'active',
            startedAt: 2000,
            status: 'successful',
          },
        ],
        runtime: {
          ...createSnapshot().runtime,
          activeColor: 'blue',
          standbyColor: null,
          state: 'serving',
        },
      })
    );

    const syncButton = screen.getByRole('button', {
      name: /Sync Standby Now/i,
    });

    expect(syncButton).toBeEnabled();
    expect(
      screen.getByText(/Trigger a standby rebuild now/i)
    ).toBeInTheDocument();

    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(mocks.requestBlueGreenInstantRollout).toHaveBeenCalledTimes(1);
    });
  });
});
