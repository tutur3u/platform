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
