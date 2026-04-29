/**
 * @vitest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it, vi } from 'vitest';
import type { BlueGreenMonitoringDeploymentRollup } from './blue-green-monitoring-deployments';
import { RolloutStagePanel } from './blue-green-monitoring-rollout-panels';

const messages: Record<string, string> = {
  'colors.blue': 'Blue',
  'deployment_status.building': 'Building',
  'panels.rollout_now': 'Rollout Now',
  'rollout.avg_latency': 'Avg Latency',
  'rollout.commit': 'Commit',
  'rollout.description': 'Track rollout state.',
  'rollout.failure_title': 'Rollout failed',
  'rollout.idle_title': 'No rollout',
  'rollout.in_progress_meta': 'Live rollout telemetry',
  'rollout.last_change': 'Last Change',
  'rollout.last_result': 'Last Result',
  'rollout.phase_time': 'Phase Time',
  'rollout.requests': 'Requests',
  'rollout.route': 'Target Route',
  'states.none': 'None',
  'stats.avg_latency': 'Avg Latency',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => messages[key] ?? key,
}));

describe('RolloutStagePanel', () => {
  it('refreshes an in-progress deployment duration every second', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-01-01T00:00:02.000Z');
      vi.setSystemTime(now);
      const startedAt = now.getTime() - 1000;

      const deployments: BlueGreenMonitoringDeploymentRollup[] = [
        {
          activeColor: 'blue',
          activeColors: ['blue'],
          averageLatencyMs: null,
          averageRequestsPerMinute: null,
          buildDurationMs: null,
          commitHash: 'deploying-commit',
          commitShortHash: 'deploying',
          commitSubject: 'Build standby',
          deploymentKind: 'promotion',
          deploymentStamp: null,
          deploymentStamps: [],
          errorCount: null,
          firstRequestAt: null,
          lastRequestAt: null,
          lifetimeMs: null,
          mergedDeploymentCount: 1,
          peakRequestsPerMinute: null,
          requestCount: null,
          runtimeState: null,
          runtimeStates: [],
          startedAt,
          status: 'building',
        },
      ];

      render(
        <RolloutStagePanel
          deployments={deployments}
          watcher={
            {
              lastDeployAt: startedAt,
              lastDeployStatus: 'building',
            } as BlueGreenMonitoringSnapshot['watcher']
          }
        />
      );

      expect(screen.getByText('1s')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('2s')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
