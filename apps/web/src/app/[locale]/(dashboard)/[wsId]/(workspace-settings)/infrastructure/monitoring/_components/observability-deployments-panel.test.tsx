/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ObservabilityDeployment } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it, vi } from 'vitest';
import { ObservabilityDeploymentsPanel } from './observability-deployments-panel';

const messages: Record<string, string> = {
  'deployments.badges.cache_hits': '{count} cached',
  'deployments.badges.rebuilds': '{count} rebuilt',
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

describe('ObservabilityDeploymentsPanel', () => {
  it('shows partial web promotion, failed Hive migration, and stage filters', () => {
    render(
      <ObservabilityDeploymentsPanel
        deployments={[createDeployment()]}
        emptyLabel="No deployments"
        hasMore={false}
        isFetchingMore={false}
        isLoading={false}
        loaded={1}
        onLoadMore={() => {}}
        total={1}
      />
    );

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
});
