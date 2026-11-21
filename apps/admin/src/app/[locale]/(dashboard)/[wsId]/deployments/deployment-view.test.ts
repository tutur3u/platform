import type {
  DeployAction,
  DeployLane,
  DeployRecord,
} from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it } from 'vitest';
import {
  laneRecords,
  projectsView,
  projectView,
  type RecordAction,
  recordActions,
} from './deployment-view';

const record = (overrides: Partial<DeployRecord>): DeployRecord => ({
  id: 'a',
  project: 'calendar',
  environment: 'production',
  lane: 'default',
  kind: 'deploy',
  status: 'succeeded',
  sha: 'a'.repeat(40),
  ref: 'refs/heads/production',
  sourceDeploymentId: null,
  url: null,
  logsUrl: null,
  actor: null,
  runId: 1,
  supersededBy: null,
  reconciled: false,
  failureReason: null,
  closedBy: null,
  epoch: 1,
  leaseDeadline: null,
  plan: null,
  artifact: null,
  createdAt: 1,
  updatedAt: 1,
  finishedAt: 1,
  ...overrides,
});
const lane = (current: DeployRecord | null): DeployLane => ({
  lane: 'default',
  epoch: 1,
  lockDeploymentId: null,
  held: false,
  holdReason: null,
  updatedAt: 1,
  current,
  deployments: [],
});

// The DeployAction variants that name one deployment.
type ScopedAction = Extract<DeployAction, { deploymentId: string }>['action'];

describe('deployment actions', () => {
  it('lists exactly the actions that target one deployment', () => {
    // Fails to compile when RecordAction and DeployAction drift apart.
    const same: [RecordAction, ScopedAction] extends [
      ScopedAction,
      RecordAction,
    ]
      ? true
      : false = true;
    expect(same).toBe(true);
  });

  it('offers nothing to viewers', () => {
    expect(recordActions('staging', lane(null), record({}), false)).toEqual([]);
  });

  it('promotes staging and rolls back to an earlier success', () => {
    const current = record({ id: 'current' });
    const earlier = record({ id: 'earlier' });
    expect(recordActions('staging', lane(current), current, true)).toEqual([
      'promote',
    ]);
    expect(recordActions('production', lane(current), earlier, true)).toEqual([
      'rollback',
    ]);
    expect(recordActions('preview', lane(current), earlier, true)).toEqual([]);
  });

  it('never offers a rollback to what a succeeded rollback already serves', () => {
    const target = record({ id: 'target' });
    const rollback = record({
      id: 'rollback',
      kind: 'rollback',
      sourceDeploymentId: 'target',
    });
    expect(recordActions('production', lane(rollback), target, true)).toEqual(
      []
    );
    expect(
      recordActions('production', lane(rollback), record({ id: 'other' }), true)
    ).toEqual(['rollback']);
  });

  it('offers resolve only while the lane is free', () => {
    const marker = record({ kind: 'rollback', status: 'queued' });
    expect(
      recordActions(
        'production',
        { ...lane(null), lockDeploymentId: 'publishing' },
        marker,
        true
      )
    ).toEqual(['cancel']);
  });

  it('lists the current deployment when it is outside the recent window', () => {
    const current = record({ id: 'old' });
    const recent = record({ id: 'new', status: 'failed' });
    expect(
      laneRecords({ ...lane(current), deployments: [recent] }).map((r) => r.id)
    ).toEqual(['new', 'old']);
    expect(
      laneRecords({ ...lane(current), deployments: [current] }).map((r) => r.id)
    ).toEqual(['old']);
  });

  it('resolves and cancels queued markers, cancels queued deploys', () => {
    const marker = record({ kind: 'promotion', status: 'queued' });
    expect(recordActions('production', lane(null), marker, true)).toEqual([
      'resolve',
      'cancel',
    ]);
    expect(
      recordActions(
        'production',
        lane(null),
        record({ status: 'queued' }),
        true
      )
    ).toEqual(['cancel']);
    expect(
      recordActions(
        'production',
        lane(null),
        record({ status: 'publishing' }),
        true
      )
    ).toEqual([]);
  });
});

describe('query views', () => {
  const base = { error: null, isPending: false, isFetching: false };
  it('separates loading, error, unconfigured, empty and ready', () => {
    expect(projectsView({ ...base, data: undefined, isPending: true })).toEqual(
      { kind: 'loading' }
    );
    expect(
      projectsView({ ...base, data: undefined, error: new Error('boom') })
    ).toEqual({ kind: 'error', message: 'boom' });
    expect(projectsView({ ...base, data: { configured: false } })).toEqual({
      kind: 'unconfigured',
    });
    expect(
      projectsView({ ...base, data: { configured: true, projects: [] } })
    ).toEqual({ kind: 'empty' });
  });

  it('keeps showing data while it refreshes', () => {
    const data = {
      configured: true as const,
      project: {
        id: 'calendar',
        provider: 'vercel' as const,
        workflows: { production: [], staging: [], preview: [] },
      },
      environments: {
        production: { ok: false as const, error: 'X' },
        staging: { ok: false as const, error: 'X' },
        preview: { ok: false as const, error: 'X' },
      },
    };
    expect(projectView({ ...base, data, isFetching: true })).toEqual({
      kind: 'ready',
      data,
      refreshing: true,
    });
  });
});
