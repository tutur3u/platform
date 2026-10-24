import { describe, expect, it, vi } from 'vitest';
import {
  assertDevboxCommitRunRunner,
  restrictReportedProtocols,
  runnerSupportsCommitRun,
} from './commit-run-guard';

const supported = {
  capabilities: { executionMode: 'trusted', protocols: { commitRun: [1] } },
  enabled_features: { run: true, judge: false },
};
const envelope = ['__ttr_commit_run_v1__', 'payload'];

function client(runners: Record<string, unknown>) {
  const from = vi.fn(() => {
    let id = '';
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => {
        id = value;
        return query;
      },
      limit: async () => ({
        data: runners[id] ? [runners[id]] : [],
        error: null,
      }),
    };
    return query;
  });
  return { from, rpc: vi.fn() } as never;
}

describe('commit-run runner eligibility (server side)', () => {
  it.each([
    ['judge feature', { ...supported, enabled_features: { judge: true } }],
    [
      'playground feature',
      { ...supported, enabled_features: { playground: true } },
    ],
    [
      'judge-only mode',
      {
        ...supported,
        capabilities: {
          ...supported.capabilities,
          executionMode: 'judge-only',
        },
      },
    ],
    [
      'no protocols',
      { ...supported, capabilities: { executionMode: 'trusted' } },
    ],
    [
      'other version',
      {
        ...supported,
        capabilities: {
          executionMode: 'trusted',
          protocols: { commitRun: [2] },
        },
      },
    ],
  ])('rejects a runner with %s', (_case, runner) => {
    expect(runnerSupportsCommitRun(runner)).toBe(false);
  });

  it('accepts a trusted runner advertising v1', () => {
    expect(runnerSupportsCommitRun(supported)).toBe(true);
  });

  it('requires a pinned, supporting runner for envelopes at create', async () => {
    const c = client({
      'trusted-1': supported,
      'judge-1': { ...supported, enabled_features: { judge: true } },
    });
    await expect(
      assertDevboxCommitRunRunner(c, { command: envelope })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      assertDevboxCommitRunRunner(c, {
        command: envelope,
        leaseId: 'lease-1',
        runnerId: 'trusted-1',
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      assertDevboxCommitRunRunner(c, { command: envelope, runnerId: 'judge-1' })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      assertDevboxCommitRunRunner(c, { command: envelope, runnerId: 'missing' })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      assertDevboxCommitRunRunner(c, {
        command: envelope,
        runnerId: 'trusted-1',
      })
    ).resolves.toBeUndefined();
    await expect(
      assertDevboxCommitRunRunner(c, { command: ['echo', 'hi'] })
    ).resolves.toBeUndefined();
  });

  it('drops protocol advertisements from non-trusted heartbeat reports', () => {
    expect(
      restrictReportedProtocols({
        executionMode: 'judge-only',
        protocols: { commitRun: [1] },
      })
    ).toEqual({ executionMode: 'judge-only' });
    expect(
      restrictReportedProtocols({ protocols: { commitRun: [1] } })
    ).toEqual({});
    expect(
      restrictReportedProtocols({
        executionMode: 'trusted',
        protocols: { commitRun: [1] },
      })
    ).toEqual({ executionMode: 'trusted', protocols: { commitRun: [1] } });
  });
});
