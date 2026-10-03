import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TuturuuuUserClient } from '../platform';
import { runDevboxFleetCommand } from './devbox-fleet';

describe('fleet maintenance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  const runner = {
    id: 'one',
    name: 'one',
    capabilities: { os: { hostname: 'host' } },
    status: 'online',
    last_heartbeat_at: new Date().toISOString(),
  };
  const snapshot = { runners: [runner], runs: [], leases: [] };
  it('defaults fleet maintenance to dry-run and never creates a run', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const createRun = vi.fn();
    const client = {
      devboxes: {
        fleet: { snapshot: vi.fn().mockResolvedValue(snapshot) },
        createRun,
      },
    } as unknown as TuturuuuUserClient;
    await runDevboxFleetCommand({
      action: 'restart',
      client,
      flags: { all: true },
      json: true,
    });
    expect(createRun).not.toHaveBeenCalled();
  });
  it.each(['runner', 'runners'])(
    'rejects --all with an explicit %s selection before creating work',
    async (flag) => {
      const createRun = vi.fn();
      const client = {
        devboxes: {
          fleet: { snapshot: vi.fn().mockResolvedValue(snapshot) },
          createRun,
        },
      } as unknown as TuturuuuUserClient;
      await expect(
        runDevboxFleetCommand({
          action: 'restart',
          client,
          flags: { all: true, apply: true, [flag]: 'one' },
          json: true,
        })
      ).rejects.toThrow('not both');
      expect(createRun).not.toHaveBeenCalled();
    }
  );
  it.each([false, true])(
    'honors fleet upgrade timeout and reports cancellation failure=%s',
    async (stopFails) => {
      vi.useFakeTimers();
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json({ version: '0.27.0' })
      );
      const run = { id: 'queued', status: 'queued' };
      const createRun = vi.fn().mockResolvedValue({ run });
      const stopRun = stopFails
        ? vi.fn().mockRejectedValue(new Error('unavailable'))
        : vi.fn().mockResolvedValue({});
      const client = {
        devboxes: {
          fleet: { snapshot: vi.fn().mockResolvedValue(snapshot) },
          createRun,
          getRun: vi.fn().mockResolvedValue({ run }),
          stopRun,
        },
      } as unknown as TuturuuuUserClient;
      const pending = runDevboxFleetCommand({
        action: 'upgrade',
        client,
        flags: { all: true, apply: true, timeout: '1s' },
        json: true,
      });
      const assertion = expect(pending).rejects.toThrow(
        stopFails ? 'Stop request failed' : 'Stop requested'
      );
      await vi.advanceTimersByTimeAsync(32_000);
      await assertion;
      expect(createRun).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutSeconds: 1 })
      );
      expect(stopRun).toHaveBeenCalledWith('queued');
    }
  );
  it('rechecks work arriving between planning and execution', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const createRun = vi.fn();
    const client = {
      devboxes: {
        fleet: {
          snapshot: vi
            .fn()
            .mockResolvedValueOnce(snapshot)
            .mockResolvedValue({
              ...snapshot,
              runs: [{ id: 'busy', runner_id: 'one', status: 'running' }],
            }),
        },
        createRun,
      },
    } as unknown as TuturuuuUserClient;
    await runDevboxFleetCommand({
      action: 'restart',
      client,
      flags: { all: true, apply: true },
      json: true,
    });
    expect(createRun).not.toHaveBeenCalled();
  });
  it('stops before touching the next runner if maintenance fails', async () => {
    const createRun = vi.fn().mockResolvedValue({
      run: { id: 'failed', status: 'failed', exitCode: 1 },
    });
    const client = {
      devboxes: {
        fleet: {
          snapshot: vi.fn().mockResolvedValue({
            ...snapshot,
            runners: [runner, { ...runner, id: 'two' }],
          }),
        },
        createRun,
      },
    } as unknown as TuturuuuUserClient;
    await expect(
      runDevboxFleetCommand({
        action: 'restart',
        client,
        flags: { all: true, apply: true },
        json: true,
      })
    ).rejects.toThrow('remaining runners were not changed');
    expect(createRun).toHaveBeenCalledTimes(1);
  });
});
