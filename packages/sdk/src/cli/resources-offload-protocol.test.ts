import { describe, expect, it, vi } from 'vitest';
import type { DevboxFleetRunner } from '../devbox-fleet-types';
import { offloadRun } from './resources';
import * as box from './resources-box-offload';

// A trusted runner built without the #6452 decoder would execute the
// commit-run envelope as a command, so offload requires the advertised
// protocol and otherwise fails closed to the local queue.
function fixture(capabilities: DevboxFleetRunner['capabilities']) {
  const runner: DevboxFleetRunner = {
    id: 'trusted-1',
    name: 'trusted-1',
    status: 'online',
    heartbeat_enabled: true,
    last_heartbeat_at: '2026-10-23T02:00:00.000Z',
    enabled_features: { run: true },
    resource_limits: null,
    capabilities,
    drain_requested_at: null,
  };
  const devboxes = {
    createRun: vi.fn(async () => ({
      run: { id: 'run-1', status: 'queued', exitCode: null },
    })),
    getRun: vi.fn(async () => ({
      run: { id: 'run-1', status: 'succeeded', exitCode: 0 },
    })),
    getRunLogs: vi.fn(async () => ({ logs: [] as string[], next: 0 })),
    stopRun: vi.fn(async () => ({ message: 'stopped' })),
    stopRunByKey: vi.fn(),
    fleet: {
      snapshot: vi.fn(async () => ({
        server_time: '2026-10-23T02:00:05.000Z',
        runners: [runner],
        runs: [],
        leases: [],
      })),
    },
  };
  const run = (target: string) =>
    offloadRun({
      home: '/unused',
      lanes: 1,
      target,
      argv: ['true'],
      queueStatus: (async () => ({
        occupied: 1,
        effectiveLanes: 1,
        waiting: [],
      })) as never,
      loadBox: async () => ({
        ...box,
        offloadCommitPlan: () => ({ sha: 'a'.repeat(40), prefix: '' }),
        createSessionClient: async () => ({ devboxes }) as never,
        runBoxOffload: (options) =>
          box.runBoxOffload({
            ...options,
            write: () => {},
            log: () => {},
            pollMs: 1,
          }),
      }),
    });
  return { devboxes, run };
}

describe('offload requires the runner commit-run protocol', () => {
  it('auto queues locally when the runner does not advertise it', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      for (const capabilities of [
        { executionMode: 'trusted' },
        { executionMode: 'trusted', protocols: {} },
        { executionMode: 'trusted', protocols: { commitRun: [2] } },
      ]) {
        const { devboxes, run } = fixture(capabilities);
        await expect(run('auto')).resolves.toBeUndefined();
        expect(devboxes.createRun).not.toHaveBeenCalled();
      }
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(
        'blockedBy=capability_missing'
      );
    } finally {
      stderr.mockRestore();
    }
  });

  it('an explicit runner fails instead of submitting the envelope', async () => {
    const { devboxes, run } = fixture({ executionMode: 'trusted' });
    await expect(run('trusted-1')).rejects.toThrow(
      /blockedBy=capability_missing.*commit-run protocol v1/u
    );
    expect(devboxes.createRun).not.toHaveBeenCalled();
  });

  it('auto queues locally when the server cannot store operation keys yet', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const { devboxes, run } = fixture({
        executionMode: 'trusted',
        protocols: { commitRun: [1] },
      });
      devboxes.createRun.mockRejectedValue(
        Object.assign(new Error('keys unavailable'), {
          status: 503,
          code: 'DEVBOX_IDEMPOTENCY_UNAVAILABLE',
        })
      );
      await expect(run('auto')).resolves.toBeUndefined();
      expect(devboxes.createRun).toHaveBeenCalledOnce();
      expect(devboxes.stopRunByKey).not.toHaveBeenCalled();
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(
        'Queueing locally'
      );
    } finally {
      stderr.mockRestore();
    }
  });

  it.each(['auto', 'trusted-1'])(
    '%s offloads to a runner that advertises it',
    async (target) => {
      const { devboxes, run } = fixture({
        executionMode: 'trusted',
        protocols: { commitRun: [1] },
      });
      await expect(run(target)).resolves.toBe(0);
      expect(devboxes.createRun).toHaveBeenCalledOnce();
    }
  );
});
