/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  BlueGreenMonitoringSnapshot,
  ObservabilityDeployment,
} from '@tuturuuu/internal-api/infrastructure';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObservabilityDeploymentsPanel } from './observability-deployments-panel';

const apiMocks = vi.hoisted(() => ({
  requestBlueGreenDeploymentRevert: vi.fn(),
  requestBlueGreenProductionPromote: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/infrastructure', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@tuturuuu/internal-api/infrastructure')
    >();

  return {
    ...actual,
    requestBlueGreenDeploymentRevert: apiMocks.requestBlueGreenDeploymentRevert,
    requestBlueGreenProductionPromote:
      apiMocks.requestBlueGreenProductionPromote,
  };
});

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const messages: Record<string, string> = {
  'deployments.badges.cache_hits': '{count} cached',
  'deployments.badges.rebuilds': '{count} rebuilt',
  'deployments.current_stage': 'Current stage: {stage}',
  'deployments.current_stage_callout': '{status} {commit} at {stage}',
  'deployments.failed_callout':
    '{stage} failed; Web is already serving {commit}',
  'deployments.filters.all_cache': 'All cache modes',
  'deployments.filters.all_stages': 'All stages',
  'deployments.filters.all_statuses': 'All statuses',
  'deployments.filters.all_targets': 'All targets',
  'deployments.filters.cached': 'Cache hits',
  'deployments.filters.rebuilt': 'Rebuilds',
  'deployments.filters.search': 'Search deployments',
  'deployments.loaded': '{loaded}/{total} rows',
  'deployments.next_retry.none': 'No retry queued',
  'deployments.next_retry.retry_target': 'Retry {target}',
  'deployments.stage_status.not_applicable': 'not applicable',
  'deployments.stages.hive-migrate': 'Hive Migration',
  'deployments.stages.hive-promote': 'Hive Promote',
  'deployments.stages.proxy-reload': 'Proxy Reload',
  'deployments.stages.support-refresh': 'Support Refresh',
  'deployments.stages.web-build': 'Web Build',
  'deployments.stages.web-promote': 'Web Promote',
  'deployments.summary.blocked_targets': 'Blocked Targets',
  'deployments.summary.cache_hits': 'Cache Hits',
  'deployments.summary.promoted_targets': 'Promoted Targets',
  'deployments.summary.rebuilds': 'Rebuilds',
  'deployments.targets.hive': 'Hive',
  'deployments.targets.proxy': 'Proxy',
  'deployments.targets.support': 'Support',
  'deployments.targets.web': 'Web',
  'controls.confirm_cancel': 'Cancel',
  'controls.deployment_revert_confirm_action': 'Queue Revert',
  'controls.deployment_revert_confirm_description':
    'Queue {mode} for {commit}.',
  'controls.deployment_revert_confirm_title': 'Revert production deployment',
  'controls.deployment_revert_description':
    'Latest {count} cached builds can revert without rebuilding.',
  'controls.deployment_revert_error': 'Could not queue revert.',
  'controls.deployment_revert_instant_action': 'Instant Revert',
  'controls.deployment_revert_mode_instant': 'Instant cached revert',
  'controls.deployment_revert_mode_rebuild': 'Rebuild and pin',
  'controls.deployment_revert_option_cached': '(cached)',
  'controls.deployment_revert_option_rebuild': '(rebuild)',
  'controls.deployment_revert_queued': 'Revert queued',
  'controls.deployment_revert_rebuild_action': 'Rebuild And Pin',
  'controls.deployment_revert_success': 'Queued revert.',
  'controls.deployment_revert_title': 'Revert production',
  'controls.production_branch_commit': 'Production',
  'controls.production_ci_failing': 'Failing',
  'controls.production_ci_missing': 'Missing',
  'controls.production_ci_passing': 'Passing',
  'controls.production_ci_pending': 'Pending',
  'controls.production_ci_status': 'CI',
  'controls.production_ci_unavailable': 'Unavailable',
  'controls.production_main_commit': 'Main',
  'controls.production_next_check': 'Next check {time}',
  'controls.production_prebuild_status': 'Prebuild {status}',
  'controls.production_promote_action': 'Promote Main Now',
  'controls.production_promote_badge': 'Production Promotion',
  'controls.production_promote_confirm_action': 'Promote Now',
  'controls.production_promote_confirm_description':
    'Queue immediate promotion.',
  'controls.production_promote_confirm_title': 'Promote main to production',
  'controls.production_promote_description': 'Auto promote description.',
  'controls.production_promote_error': 'Could not queue promotion.',
  'controls.production_promote_queued': 'Promotion queued',
  'controls.production_promote_success': 'Queued promotion.',
  'controls.production_promote_title': 'Auto promote main to production',
  'controls.production_wait_remaining': 'Wait',
  'infinite.end': 'End',
  'infinite.loading': 'Loading...',
  load_older: 'Load Older',
  'states.none': 'None',
  'states.unknown': 'Unknown',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    let value = messages[key] ?? key;
    for (const [paramKey, paramValue] of Object.entries(params ?? {})) {
      value = value.replace(`{${paramKey}}`, String(paramValue));
    }
    return value;
  },
}));

function createDeployment(): ObservabilityDeployment {
  return {
    color: 'green',
    commitHash: 'abc123456789',
    commitShortHash: 'abc1234',
    commitSubject: 'Ship staged deployment',
    deploymentKind: 'promotion',
    deploymentStamp: 'deploy-abc1234',
    durationMs: 9000,
    errorCount: 1,
    failureReason: 'hive migration failed',
    imageTag: null,
    lastRequestAt: null,
    requestCount: 42,
    runtimeState: null,
    startedAt: Date.UTC(2026, 4, 18, 1, 0, 0),
    stageSummary: {
      blockedTargets: ['hive'],
      cacheHitCount: 2,
      failedStageCount: 1,
      promotedTargets: ['web'],
      rebuildCount: 1,
      runningStageCount: 0,
      skippedStageCount: 2,
      totalStageCount: 4,
    },
    stages: [
      {
        buildServices: ['web-green'],
        color: 'green',
        durationMs: 1000,
        failureReason: null,
        finishedAt: 2000,
        id: 'web-build',
        serviceNames: ['web-green'],
        skippedReason: null,
        startedAt: 1000,
        status: 'succeeded',
        target: 'web',
      },
      {
        buildServices: [],
        color: 'green',
        durationMs: 1000,
        failureReason: null,
        finishedAt: 3000,
        id: 'web-promote',
        serviceNames: ['web-green'],
        skippedReason: null,
        startedAt: 2000,
        status: 'succeeded',
        target: 'web',
      },
      {
        buildServices: [],
        color: 'green',
        durationMs: 1000,
        failureReason: 'hive migration failed',
        finishedAt: 4000,
        id: 'hive-migrate',
        serviceNames: ['hive-db-migrate'],
        skippedReason: null,
        startedAt: 3000,
        status: 'failed',
        target: 'hive',
      },
    ],
    status: 'failed',
    synthesizedStages: false,
    supportBuildCacheHits: 2,
    supportBuildServiceCount: 3,
    supportBuildServices: ['hive-green'],
    targetStates: {
      hive: {
        activeColor: 'blue',
        commitHash: 'oldhive',
        commitShortHash: 'oldhive',
        deploymentStamp: 'deploy-oldhive',
        health: 'blocked',
        lastPromotedAt: 1000,
        standbyColor: 'green',
      },
      web: {
        activeColor: 'green',
        commitHash: 'abc123456789',
        commitShortHash: 'abc1234',
        deploymentStamp: 'deploy-abc1234',
        health: 'healthy',
        lastPromotedAt: 3000,
        standbyColor: 'blue',
      },
    },
  };
}

function renderPanel(
  props: Partial<Parameters<typeof ObservabilityDeploymentsPanel>[0]> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ObservabilityDeploymentsPanel
        deployments={[createDeployment()]}
        emptyLabel="No deployments"
        hasMore={false}
        isFetchingMore={false}
        isLoading={false}
        loaded={1}
        onLoadMore={() => {}}
        snapshot={null}
        total={1}
        {...props}
      />
    </QueryClientProvider>
  );
}

function createSnapshot(): BlueGreenMonitoringSnapshot {
  return {
    analytics: {
      current: { daily: null, monthly: null, weekly: null, yearly: null },
      recentRequests: [],
      totalPersistedLogs: 0,
      trends: { daily: [], monthly: [], weekly: [], yearly: [] },
    },
    buildCache: { current: {}, history: [], total: 0 },
    control: {
      deploymentPin: null,
      deploymentRevertRequest: null,
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
      productionPromoteRequest: null,
    },
    deployments: [
      {
        commitHash: 'cached123456789',
        commitShortHash: 'cached1',
        commitSubject: 'Cached rollback target',
        finishedAt: 5000,
        imageTag: 'platform-web-cache:cached1',
        status: 'successful',
      },
    ],
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
    overview: {
      averageBuildDurationMs: null,
      currentAverageRequestsPerMinute: null,
      currentPeakRequestsPerMinute: null,
      currentRequestCount: null,
      failedDeployments: 0,
      successfulDeployments: 1,
      totalDeployments: 1,
      totalPersistedLogs: 0,
      totalRequestsServed: 0,
    },
    productionPromotion: {
      ci: {
        completed: 4,
        failing: 0,
        pending: 0,
        state: 'passing',
        total: 4,
        unavailableReason: null,
      },
      decision: {
        blockedReasons: [],
        bypassed: false,
        ready: true,
        status: 'ready',
      },
      kind: 'production-promotion-state',
      main: {
        committedAt: '2026-06-10T10:00:00.000Z',
        hash: 'main123456789',
        shortHash: 'main123',
        subject: 'Ship main',
      },
      nextCheckAt: 2000,
      prebuild: {
        imageTag: 'platform-web-cache:main123',
        status: 'cached',
        updatedAt: 1000,
      },
      production: {
        committedAt: '2026-06-10T09:00:00.000Z',
        hash: 'prod123456789',
        shortHash: 'prod123',
        subject: 'Current production',
      },
      queuedRequest: null,
      requiredDelayMs: 600_000,
      sourceBranch: 'main',
      targetBranch: 'production',
      updatedAt: '2026-06-10T10:20:00.000Z',
      waitRemainingMs: 0,
    },
    recoveryCache: {
      deployments: [
        {
          commitHash: 'cached123456789',
          imageTag: 'platform-web-cache:cached1',
          status: 'successful',
        },
      ],
      limit: 5,
      total: 1,
    },
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
          commitHash: 'cached123456789',
          commitShortHash: 'cached1',
          deploymentStamp: null,
          health: 'healthy',
          lastPromotedAt: null,
          standbyColor: 'green',
        },
      },
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
      intervalMs: 5000,
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
      updatedAt: 1000,
    },
  };
}

describe('ObservabilityDeploymentsPanel', () => {
  beforeEach(() => {
    apiMocks.requestBlueGreenDeploymentRevert.mockReset();
    apiMocks.requestBlueGreenProductionPromote.mockReset();
  });

  it('shows production promotion and instant revert controls from the watcher snapshot', async () => {
    apiMocks.requestBlueGreenProductionPromote.mockResolvedValueOnce({
      request: {
        bypassChecks: true,
        bypassDelay: true,
        kind: 'production-promote',
        requestedAt: '2026-06-10T10:00:00.000Z',
        requestedBy: 'user-1',
        requestedByEmail: null,
        sourceBranch: 'main',
        targetBranch: 'production',
      },
    });
    apiMocks.requestBlueGreenDeploymentRevert.mockResolvedValueOnce({
      request: {
        commitHash: 'cached123456789',
        commitShortHash: 'cached1',
        commitSubject: 'Cached rollback target',
        deploymentStamp: null,
        imageTag: 'platform-web-cache:cached1',
        instant: true,
        kind: 'deployment-revert',
        requestedAt: '2026-06-10T10:05:00.000Z',
        requestedBy: 'user-1',
        requestedByEmail: null,
      },
    });

    renderPanel({ snapshot: createSnapshot() });

    expect(screen.getByText('Auto promote main to production')).toBeVisible();
    expect(screen.getByText('Instant cached revert')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Promote Main Now/i }));
    fireEvent.click(screen.getByRole('button', { name: /Promote Now/i }));

    await waitFor(() => {
      expect(apiMocks.requestBlueGreenProductionPromote).toHaveBeenCalledTimes(
        1
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /Instant Revert/i }));
    fireEvent.click(screen.getByRole('button', { name: /Queue Revert/i }));

    await waitFor(() => {
      expect(apiMocks.requestBlueGreenDeploymentRevert).toHaveBeenCalledWith({
        commitHash: 'cached123456789',
        imageTag: 'platform-web-cache:cached1',
        instant: true,
      });
    });
  });

  it('shows partial web promotion, failed Hive migration, and stage filters', () => {
    renderPanel();

    expect(
      screen.getByText('Hive Migration failed; Web is already serving abc1234')
    ).toBeInTheDocument();
    expect(screen.getByText('2 cached')).toBeInTheDocument();
    expect(screen.getByText('1 rebuilt')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[2]!, { target: { value: 'hive-migrate' } });
    expect(screen.getByText('Ship staged deployment')).toBeInTheDocument();

    fireEvent.change(selects[0]!, { target: { value: 'proxy' } });
    expect(screen.getByText('No deployments')).toBeInTheDocument();
  });

  it('marks missing historical stages as not applicable', () => {
    const deployment = {
      ...createDeployment(),
      stageSummary: {
        blockedTargets: [],
        cacheHitCount: 0,
        failedStageCount: 0,
        promotedTargets: [],
        rebuildCount: 0,
        runningStageCount: 0,
        skippedStageCount: 0,
        totalStageCount: 0,
      },
      stages: [],
      status: 'successful',
    } satisfies ObservabilityDeployment;

    renderPanel({ deployments: [deployment] });

    expect(screen.getAllByText('not applicable').length).toBeGreaterThanOrEqual(
      6
    );
  });

  it('surfaces the current stage for an active deployment', () => {
    const deployment = {
      ...createDeployment(),
      failureReason: null,
      stageSummary: {
        blockedTargets: [],
        cacheHitCount: 0,
        failedStageCount: 0,
        promotedTargets: [],
        rebuildCount: 0,
        runningStageCount: 1,
        skippedStageCount: 0,
        totalStageCount: 1,
      },
      stages: [
        {
          buildServices: ['web-green'],
          color: 'green',
          durationMs: null,
          failureReason: null,
          finishedAt: null,
          id: 'web-build',
          serviceNames: ['web-green'],
          skippedReason: null,
          startedAt: 1000,
          status: 'running',
          target: 'web',
        },
      ],
      status: 'building',
      synthesizedStages: true,
    } satisfies ObservabilityDeployment;

    renderPanel({ deployments: [deployment] });

    expect(
      screen.getByText('building abc1234 at Web Build')
    ).toBeInTheDocument();
    expect(screen.getByText('Current stage: Web Build')).toBeInTheDocument();
  });

  it('does not show a current failure banner for an older failed same-commit attempt', () => {
    const failedAttempt = createDeployment();
    const latestSuccessful = {
      ...createDeployment(),
      deploymentStamp: 'deploy-success',
      failureReason: null,
      stageSummary: {
        blockedTargets: [],
        cacheHitCount: 0,
        failedStageCount: 0,
        promotedTargets: ['web'],
        rebuildCount: 0,
        runningStageCount: 0,
        skippedStageCount: 0,
        totalStageCount: 2,
      },
      stages: [
        {
          buildServices: ['web-green'],
          color: 'green',
          durationMs: 1000,
          failureReason: null,
          finishedAt: 2000,
          id: 'web-build',
          serviceNames: ['web-green'],
          skippedReason: null,
          startedAt: 1000,
          status: 'succeeded',
          target: 'web',
        },
        {
          buildServices: [],
          color: 'green',
          durationMs: 1000,
          failureReason: null,
          finishedAt: 3000,
          id: 'web-promote',
          serviceNames: ['web-green'],
          skippedReason: null,
          startedAt: 2000,
          status: 'succeeded',
          target: 'web',
        },
      ],
      status: 'successful',
    } satisfies ObservabilityDeployment;

    renderPanel({
      deployments: [latestSuccessful, failedAttempt],
      loaded: 2,
      total: 2,
    });

    expect(
      screen.queryByText(
        'Hive Migration failed; Web is already serving abc1234'
      )
    ).not.toBeInTheDocument();
    expect(screen.getByText('Blocked Targets').parentElement).toHaveTextContent(
      'Blocked Targets0'
    );
    expect(screen.getAllByText('Ship staged deployment')).toHaveLength(2);
  });
});
