import { describe, expect, it } from 'vitest';
import { dedupeBlueGreenDeployments } from './blue-green-monitoring-deployments';

describe('dedupeBlueGreenDeployments', () => {
  it('merges successful blue and green deployments for the same commit', () => {
    expect(
      dedupeBlueGreenDeployments([
        {
          activeColor: 'blue',
          averageRequestsPerMinute: 10,
          commitHash: 'commit-a',
          commitShortHash: 'aaaaaa',
          commitSubject: 'Ship rollout',
          deploymentStamp: 'blue-stamp',
          requestCount: 100,
          runtimeState: 'active',
          status: 'successful',
        },
        {
          activeColor: 'green',
          averageRequestsPerMinute: 5,
          commitHash: 'commit-a',
          commitShortHash: 'aaaaaa',
          commitSubject: 'Ship rollout',
          deploymentStamp: 'green-stamp',
          requestCount: 50,
          runtimeState: 'standby',
          status: 'successful',
        },
      ])
    ).toMatchObject([
      {
        activeColor: 'blue / green',
        activeColors: ['blue', 'green'],
        averageRequestsPerMinute: 15,
        commitHash: 'commit-a',
        deploymentStamp: 'blue-stamp / green-stamp',
        deploymentStamps: ['blue-stamp', 'green-stamp'],
        mergedDeploymentCount: 2,
        requestCount: 150,
        runtimeState: 'active',
        runtimeStates: ['active', 'standby'],
      },
    ]);
  });

  it('keeps failed attempts separate so retry history stays visible', () => {
    expect(
      dedupeBlueGreenDeployments([
        {
          commitHash: 'commit-b',
          commitShortHash: 'bbbbbb',
          finishedAt: 300,
          startedAt: 200,
          status: 'failed',
        },
        {
          commitHash: 'commit-b',
          commitShortHash: 'bbbbbb',
          finishedAt: 200,
          startedAt: 100,
          status: 'failed',
        },
      ])
    ).toHaveLength(2);
  });
});
